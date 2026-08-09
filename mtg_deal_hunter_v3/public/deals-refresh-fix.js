(()=>{
  const bust=u=>u+(u.includes('?')?'&':'?')+'_='+Date.now();
  async function loadFeed(){try{const r=await fetch(bust('/.netlify/functions/deals'),{cache:'no-store'});return await r.json()}catch{return null}}
  function report(d){const at=d?.updated_at?new Date(d.updated_at).toLocaleString():'never',sources=Number(d?.source_count||0),seen=Number(d?.items_seen||0),evald=Number(d?.items_evaluated||0),qualified=Number(d?.qualified_this_run||0),retained=Array.isArray(d?.deals)?d.deals.length:Number(d?.retained_deals||0);return `Last scan ${at} • ${sources} source${sources===1?'':'s'} • ${seen} listings seen • ${evald} evaluated • ${qualified} qualified this run • ${retained} retained deal${retained===1?'':'s'}`}
  async function refreshDisplay(){const status=document.getElementById('dealStatus'),d=await loadFeed();if(status&&d){status.textContent=report(d);status.className=Number(d.source_count||0)>0?'notice':'bad';}try{if(typeof window.loadDeals==='function')await window.loadDeals()}catch{}}
  function init(){
    const btn=document.getElementById('refreshDeals');
    if(!btn||btn.dataset.previewScanFix==='3')return;
    btn.dataset.previewScanFix='3';
    btn.onclick=async()=>{
      if(btn.disabled)return;const old=btn.textContent;btn.disabled=true;btn.textContent='Scanning…';const status=document.getElementById('dealStatus');if(status){status.textContent='Running fresh market sweep and price-watch scan…';status.className='notice'}
      try{
        const [dealRes,watchRes]=await Promise.all([fetch(bust('/.netlify/functions/scan-deals-now'),{cache:'no-store'}),fetch(bust('/.netlify/functions/price-watch-now'),{cache:'no-store'})]);
        const dealData=await dealRes.json().catch(()=>({})),watchData=await watchRes.json().catch(()=>({}));
        if(!dealRes.ok||dealData.ok===false)throw Error(dealData.error||`Deal scan returned ${dealRes.status}`);
        if(!watchRes.ok||watchData.ok===false)throw Error(watchData.error||`Price-watch scan returned ${watchRes.status}`);
        const feed=await loadFeed(),merged=feed||dealData;if(status){status.textContent=report(merged);status.className=Number(merged?.source_count||0)>0?'notice':'bad'}
        try{if(typeof window.loadDeals==='function')await window.loadDeals()}catch{}
      }catch(e){if(status){status.textContent='Deal refresh failed: '+e.message;status.className='bad';}}
      finally{btn.disabled=false;btn.textContent=old;}
    };
    refreshDisplay();
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();