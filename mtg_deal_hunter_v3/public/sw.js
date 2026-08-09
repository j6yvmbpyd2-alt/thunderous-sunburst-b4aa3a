const CACHE='mtg-deal-hunter-v3-5';
const ASSETS=['./','index.html','manifest.webmanifest','icon.svg','link-fix.js'];

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

function repairDynamicLinks(html){
  html=html.replaceAll(
    `onclick=\"window.open(\${JSON.stringify(x.url)},'_blank')\"`,
    `data-url=\"\${encodeURIComponent(x.url)}\" onclick=\"location.href=decodeURIComponent(this.dataset.url)\"`
  );
  html=html.replaceAll(
    `onclick=\"window.open(\${JSON.stringify(w.scryfall_uri)},'_blank')\"`,
    `data-url=\"\${encodeURIComponent(w.scryfall_uri)}\" onclick=\"location.href=decodeURIComponent(this.dataset.url)\"`
  );
  return html;
}

async function patchedNavigationResponse(request){
  const fresh=await fetch(request,{cache:'no-store'});
  const type=fresh.headers.get('content-type')||'';
  if(!type.includes('text/html')) return fresh;

  let html=repairDynamicLinks(await fresh.text());
  if(!html.includes('link-fix.js')) html=html.replace('</body>','<script src="/link-fix.js"></script></body>');
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
