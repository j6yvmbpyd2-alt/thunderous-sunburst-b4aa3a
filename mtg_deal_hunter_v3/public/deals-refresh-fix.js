(()=>{
  const bust=u=>u+(u.includes('?')?'&':'?')+'_='+Date.now();
  async function loadFeed(){try{const r=await fetch(bust('/.netlify/functions/deals'),{cache:'no-store'});return await r.json()}catch{return null}}
  function ensurePanel(){let p=document.getElementById('marketSweepTelemetry');if(p)return p;const status=document.getElementById('dealStatus');if(!status)return null;p=document.createElement('div');p.id='marketSweepTelemetry';p.className='card';p.style='margin-top:12px;padding:12px';status.insertAdjacentElement('afterend',p);return p}
  function metrics(d){const sources=Number(d?.source_count||0),seen=Number(d?.items_seen||0),evald=Number(d?.items_evaluated||0),qualified=Number(d?.qualified_this_run||0),watchHits=Number(d?.watch_hits||0),allDeals=Array.isArray(d?.deals)?d.deals:[],marketDeals=Math.max(0,allDeals.length-watchHits),retained=Array.isArray(d?.deals)?allDeals.length:Number(d?.retained_deals||0),at=d?.updated_at?new Date(d.updated_at).toLocaleString():'never';return{sources,seen,evald,qualified,watchHits,marketDeals,retained,at}}
  function paint(d){const p=ensurePanel();if(!p)return;const m=metrics(d||{}),ok=m.sources>0;const sourceState=ok?`${m.sources} configured source${m.sources===1?'':'s'}`:'NO MARKET SOURCES CONFIGURED';p.innerHTML=`<div class="row"><div><b>Market Sweep Telemetry</b><div class="${ok?'good':'bad'}">${sourceState}</div></div><span class="pill ${ok?'good':'bad'}">${ok?'SCANNER ACTIVE':'SCANNER EMPTY'}</span></div><div class="grid3" style="margin-top:10px"><div class="kpi"><span class="muted">Sources scanned</span><b>${m.sources}</b></div><div class="kpi"><span class="muted">Listings seen</span><b>${m.seen}</b></div><div class="kpi"><span class="muted">Listings evaluated</span><b>${m.evald}</b></div></div><div class="grid3" style="margin-top:9px"><div class="kpi"><span class="muted">New market deals</span><b>${m.qualified}</b></div><div class="kpi"><span class="muted">Price-watch hits</span><b>${m.watchHits}</b></div><div class="kpi"><span class="muted">Retained feed entries</span><b>${m.retained}</b></div></div><div class="tiny" style="margin-top:9px">Last full market sweep: ${m.at}${ok?'':' • Add feed/store sources before this can discover marketplace deals.'}</div>`;return m}
  async function refreshTelemetry(){const d=await loadFeed();if(d)paint(d);return d}
  function init(){
    const btn=document.getElementById('refreshDeals');if(!btn)return;
    btn.dataset.previewScanFix='4';
    btn.onclick=async()=>{
      if(btn.disabled)return;const old=btn.textContent;btn.disabled=true;btn.textContent='Scanning…';const status=document.getElementById('dealStatus');if(status){status.textContent='Running fresh market sweep and price-watch scan…';status.className='notice'}
      const p=ensurePanel();if(p)p.innerHTML='<div class="notice">Running market sweep now…</div>';
      try{
        const [dealRes,watchRes]=await Promise.all([fetch(bust('/.netlify/functions/scan-deals-now'),{cache:'no-store'}),fetch(bust('/.netlify/functions/price-watch-now'),{cache:'no-store'})]);
        const dealData=await dealRes.json().catch(()=>({})),watchData=await watchRes.json().catch(()=>({}));
        if(!dealRes.ok||dealData.ok===false)throw Error(dealData.error||`Deal scan returned ${dealRes.status}`);
        if(!watchRes.ok||watchData.ok===false)throw Error(watchData.error||`Price-watch scan returned ${watchRes.status}`);
        try{if(typeof window.loadDeals==='function')await window.loadDeals()}catch{}
        const feed=await refreshTelemetry()||dealData,m=paint(feed);if(status){status.textContent=m?.sources>0?`Market sweep complete • ${m.qualified} new market deal${m.qualified===1?'':'s'} • ${m.watchHits} price-watch hit${m.watchHits===1?'':'s'}`:'Market sweep complete • NO MARKET SOURCES CONFIGURED';status.className=m?.sources>0?'notice':'bad'}
      }catch(e){if(status){status.textContent='Deal refresh failed: '+e.message;status.className='bad'}if(p)p.innerHTML=`<div class="bad">Market sweep failed: ${String(e.message||e)}</div>`}
      finally{btn.disabled=false;btn.textContent=old;}
    };
    refreshTelemetry();
    const obs=new MutationObserver(()=>{setTimeout(()=>refreshTelemetry(),0)});const status=document.getElementById('dealStatus');if(status)obs.observe(status,{childList:true,subtree:true,characterData:true});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();