// Função "admin-users": o administrador cria, altera e remove usuários do painel.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.4'

const DOM = '@painel.interno'
const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...cors, 'Content-Type': 'application/json' } })
const ROLES = ['operador', 'administrador']

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors })
  try {
    const url = Deno.env.get('SUPABASE_URL')!
    const anon = Deno.env.get('SUPABASE_ANON_KEY')!
    const svc = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const uc = createClient(url, anon, { global: { headers: { Authorization: req.headers.get('Authorization') ?? '' } } })
    const { data: { user } } = await uc.auth.getUser()
    if (!user) return json({ error: 'Não autenticado.' }, 401)

    const admin = createClient(url, svc)
    const { data: me } = await admin.from('profiles').select('role,ativo').eq('id', user.id).single()
    if (!me || !me.ativo || me.role !== 'administrador') return json({ error: 'Apenas administradores.' }, 403)

    const b = await req.json()
    switch (b.action) {
      case 'list': {
        const { data, error } = await admin.from('profiles').select('id,login,nome,role,ativo').order('nome')
        if (error) throw error
        return json({ users: data })
      }
      case 'create': {
        const login = String(b.login || '').trim().toLowerCase()
        const nome = String(b.nome || '').trim()
        const senha = String(b.senha || '')
        if (!/^[a-z0-9._-]{3,30}$/.test(login)) return json({ error: 'Login: 3 a 30 caracteres (letras, números, ponto, hífen ou _).' }, 400)
        if (!nome) return json({ error: 'Informe o nome.' }, 400)
        if (senha.length < 6) return json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, 400)
        if (!ROLES.includes(b.role)) return json({ error: 'Perfil inválido.' }, 400)
        const { data: u, error } = await admin.auth.admin.createUser({ email: login + DOM, password: senha, email_confirm: true })
        if (error) return json({ error: /already/i.test(error.message) ? 'Este login já existe.' : error.message }, 400)
        const { error: e2 } = await admin.from('profiles').insert({ id: u.user.id, login, nome, role: b.role })
        if (e2) { await admin.auth.admin.deleteUser(u.user.id); return json({ error: e2.message }, 400) }
        return json({ ok: true })
      }
      case 'update': {
        if (b.id === user.id && (b.role !== 'administrador' || b.ativo === false))
          return json({ error: 'Você não pode rebaixar nem desativar a si mesmo.' }, 400)
        const up: Record<string, unknown> = {}
        if (b.role) { if (!ROLES.includes(b.role)) return json({ error: 'Perfil inválido.' }, 400); up.role = b.role }
        if (typeof b.ativo === 'boolean') up.ativo = b.ativo
        if (b.nome) up.nome = String(b.nome).trim()
        const { error } = await admin.from('profiles').update(up).eq('id', b.id)
        if (error) throw error
        if (typeof b.ativo === 'boolean')
          await admin.auth.admin.updateUserById(b.id, { ban_duration: b.ativo ? 'none' : '876000h' })
        return json({ ok: true })
      }
      case 'password': {
        if (String(b.senha || '').length < 6) return json({ error: 'A senha precisa ter ao menos 6 caracteres.' }, 400)
        const { error } = await admin.auth.admin.updateUserById(b.id, { password: b.senha })
        if (error) throw error
        return json({ ok: true })
      }
      case 'delete': {
        if (b.id === user.id) return json({ error: 'Você não pode remover a si mesmo.' }, 400)
        const { error } = await admin.auth.admin.deleteUser(b.id)
        if (error) throw error
        return json({ ok: true })
      }
      default:
        return json({ error: 'Ação inválida.' }, 400)
    }
  } catch (e) {
    return json({ error: String((e as Error).message ?? e) }, 500)
  }
})
