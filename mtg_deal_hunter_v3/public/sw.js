const CACHE='mtg-deal-hunter-v3-3';
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

async function patchedNavigationResponse(request){
  const fresh=await fetch(request,{cache:'no-store'});
  const type=fresh.headers.get('content-type')||'';
  if(!type.includes('text/html')) return fresh;

  const html=(await fresh.text()).replaceAll('window.open(','location.assign(');
  const headers=new Headers(fresh.headers);
  headers.set('content-type','text/html; charset=utf-8');
  headers.set('cache-control','no-store');
  return new Response(html,{status:fresh.status,statusText:fresh.statusText,headers});
}

self.addEventListener('fetch',e=>{
  const u=new URL(e.request.url);
  if(u.pathname.startsWith('/.netlify/functions/')||u.hostname==='api.scryfall.com') return;

  if(e.request.mode==='navigate'){
    e.respondWith((async()=>{
      try{
        const fresh=await patchedNavigationResponse(e.request);
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
