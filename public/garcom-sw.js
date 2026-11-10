const cacheName='jc-garcom-v1';
const paths=['/garcom','/app.js','/style.css','/item-photos.css','/api/menu?table=&k=',
  '/img/hero.webp','/img/bebidas.webp','/img/petiscos.webp','/img/lanches.webp','/img/caldos.webp',
  '/img/itens-bebidas-a.webp','/img/itens-bebidas-b.webp','/img/itens-lanches.webp','/img/itens-petiscos-a.webp','/img/itens-petiscos-b.webp'];
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(cacheName).then(cache=>cache.addAll(paths)).then(()=>self.skipWaiting()));
});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(key=>key.startsWith('jc-garcom-')&&key!==cacheName)
    .map(key=>caches.delete(key)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const url=new URL(event.request.url);
  if(event.request.method!=='GET'||url.origin!==self.location.origin||!paths.includes(url.pathname+url.search))return;
  event.respondWith(fetch(event.request,{signal:AbortSignal.timeout(6000)}).then(response=>{
    if(!response.ok) return response;
    const copy=response.clone();
    event.waitUntil(caches.open(cacheName).then(cache=>cache.put(event.request,copy)).catch(()=>{}));
    return response;
  }).catch(async()=>await caches.match(event.request,{cacheName})||Response.error()));
});
