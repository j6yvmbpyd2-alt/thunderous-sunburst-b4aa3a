const CACHE='mtg-deal-hunter-v3-1';
const ASSETS=['./','index.html','manifest.webmanifest','icon.svg'];

self.addEventListener('install',e=>{
  self.skipWaiting();
  e.waitUntil(caches.open(CACHE).then(c=>c.addAll(ASSETS)));
});

self.addEventListener('activate',e=>{
  e.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/.netlify/functions/')||u.hostname==='api.scryfall.com') return;

  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const fresh=await fetch(e.request,{cache:'no-store'});
        const cache=await caches.open(CACHE);
        cache.put('index.html',fresh.clone());
        return fresh;
      }catch{
        return (await caches.match('index.html')) || Response.error();
      }
    })());
    return;
  }

  e.respondWith((async()=>{
    const cached=await caches.match(e.request);
    if(cached) return cached;
    const fresh=await fetch(e.request);
    const cache=await caches.open(CACHE);
    cache.put(e.request,fresh.clone());
    return fresh;
  })());
});
