/* Service worker: guarda o painel e as bibliotecas para abrir sem internet. */
const C='babr-v6',HOSTS=['cdnjs.cloudflare.com','www.gstatic.com','fonts.googleapis.com','fonts.gstatic.com','cdn.jsdelivr.net'];
self.addEventListener('install',e=>{e.waitUntil(caches.open(C).then(c=>c.addAll(['./','./index.html','./manifest.webmanifest','./icon-192.png'])).then(()=>self.skipWaiting()))});
self.addEventListener('activate',e=>{e.waitUntil(caches.keys().then(k=>Promise.all(k.filter(x=>x!==C).map(x=>caches.delete(x)))).then(()=>self.clients.claim()))});
self.addEventListener('fetch',e=>{
  const r=e.request,u=new URL(r.url);
  if(r.method!=='GET'||!(u.origin===location.origin||HOSTS.includes(u.hostname)))return;
  e.respondWith(caches.open(C).then(async c=>{
    const m=await c.match(r,{ignoreSearch:u.origin===location.origin})||(r.mode==='navigate'?await c.match('./index.html'):undefined);
    const n=fetch(r).then(x=>{if(x&&(x.ok||x.type==='opaque'))c.put(r,x.clone());return x}).catch(()=>m);
    return m||n;
  }));
});
