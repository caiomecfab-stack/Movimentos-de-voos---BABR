const C='voos-babr-v3';
self.addEventListener('install',e=>{self.skipWaiting()});
self.addEventListener('activate',e=>{e.waitUntil(clients.claim())});
self.addEventListener('fetch',e=>{const r=e.request;if(r.method!=='GET')return;
const u=new URL(r.url);if(u.origin!==location.origin&&r.destination!=='script')return;
e.respondWith(fetch(r).then(x=>{const c=x.clone();caches.open(C).then(k=>k.put(r,c)).catch(()=>{});return x}).catch(()=>caches.match(r).then(x=>x||caches.match('./index.html'))))});
