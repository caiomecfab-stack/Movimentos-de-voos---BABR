-- =====================================================================
-- PAINEL DE VOOS BABR — banco de dados (Supabase)
-- Cole tudo no SQL Editor do Supabase e clique em RUN (uma única vez).
-- =====================================================================

create table if not exists public.profiles (
  id     uuid primary key references auth.users(id) on delete cascade,
  login  text unique not null,
  nome   text not null,
  role   text not null check (role in ('operador','administrador')),
  ativo  boolean not null default true,
  criado timestamptz not null default now()
);

create table if not exists public.movimentos (
  id         text primary key,
  d          jsonb not null,               -- dados do voo (inclui id, ty, ac, sq, from, to, utc, ofg...)
  atualizado timestamptz not null default now()
);

create table if not exists public.config (
  chave text primary key,                  -- 'tema' | 'nome'
  valor jsonb not null
);

create table if not exists public.historico (
  id bigint generated always as identity primary key,
  t  bigint not null,
  w  text,
  a  text,
  d  text
);

-- papel do usuário logado ('operador' | 'administrador' | null)
create or replace function public.papel() returns text
language sql stable security definer set search_path = public as $$
  select role from public.profiles where id = auth.uid() and ativo
$$;

alter table public.profiles   enable row level security;
alter table public.movimentos enable row level security;
alter table public.config     enable row level security;
alter table public.historico  enable row level security;

-- Quem NÃO está logado (perfil "Usuário") só pode LER voos e configurações.
drop policy if exists mv_sel on public.movimentos;
drop policy if exists mv_ins on public.movimentos;
drop policy if exists mv_upd on public.movimentos;
drop policy if exists mv_del on public.movimentos;
create policy mv_sel on public.movimentos for select using (true);
create policy mv_ins on public.movimentos for insert to authenticated with check (public.papel() in ('operador','administrador'));
create policy mv_upd on public.movimentos for update to authenticated using (public.papel() in ('operador','administrador')) with check (public.papel() in ('operador','administrador'));
create policy mv_del on public.movimentos for delete to authenticated using (public.papel() in ('operador','administrador'));

drop policy if exists cfg_sel on public.config;
drop policy if exists cfg_ins on public.config;
drop policy if exists cfg_upd on public.config;
create policy cfg_sel on public.config for select using (true);
create policy cfg_ins on public.config for insert to authenticated with check (public.papel() = 'administrador');
create policy cfg_upd on public.config for update to authenticated using (public.papel() = 'administrador') with check (public.papel() = 'administrador');

drop policy if exists h_sel on public.historico;
drop policy if exists h_ins on public.historico;
create policy h_sel on public.historico for select to authenticated using (public.papel() = 'administrador');
create policy h_ins on public.historico for insert to authenticated with check (public.papel() in ('operador','administrador'));

drop policy if exists p_sel on public.profiles;
create policy p_sel on public.profiles for select to authenticated using (id = auth.uid() or public.papel() = 'administrador');
-- (criar/alterar/remover usuários é feito só pela função "admin-users", com chave de serviço)

-- Tempo real
alter publication supabase_realtime add table public.movimentos;
alter publication supabase_realtime add table public.config;

-- ---------------------------------------------------------------------
-- Sincronização da AGENDA (chamada pelo Google Apps Script com a chave de serviço)
-- Insere/atualiza os voos da agenda, preserva a marcação OF GENERAL feita no painel
-- e apaga os voos da agenda que foram removidos dentro da janela de datas.
-- ---------------------------------------------------------------------
create or replace function public.sincronizar_agenda(itens jsonb, ini bigint, fim bigint)
returns void language plpgsql security definer set search_path = public as $$
begin
  insert into public.movimentos (id, d)
  select it->>'id', it from jsonb_array_elements(itens) it
  on conflict (id) do update
    set d = excluded.d || case when public.movimentos.d ? 'ofg'
                               then jsonb_build_object('ofg', public.movimentos.d->'ofg')
                               else '{}'::jsonb end,
        atualizado = now()
    where public.movimentos.d is distinct from
          (excluded.d || case when public.movimentos.d ? 'ofg'
                              then jsonb_build_object('ofg', public.movimentos.d->'ofg')
                              else '{}'::jsonb end);

  delete from public.movimentos m
  where m.d->>'src' = 'agenda'
    and (m.d->>'utc')::bigint between ini and fim
    and m.id not in (select it->>'id' from jsonb_array_elements(itens) it);
end $$;

revoke all on function public.sincronizar_agenda(jsonb, bigint, bigint) from public, anon, authenticated;
grant execute on function public.sincronizar_agenda(jsonb, bigint, bigint) to service_role;

-- ---------------------------------------------------------------------
-- PRIMEIRO ADMINISTRADOR
-- 1) No painel do Supabase: Authentication > Users > Add user > Create new user
--    e-mail:  admin@painel.interno   senha: (a sua)   marque "Auto Confirm User"
-- 2) Depois rode o comando abaixo (troque o nome se quiser):
--
-- insert into public.profiles (id, login, nome, role)
-- select id, 'admin', 'Administrador', 'administrador'
-- from auth.users where email = 'admin@painel.interno';
-- ---------------------------------------------------------------------
