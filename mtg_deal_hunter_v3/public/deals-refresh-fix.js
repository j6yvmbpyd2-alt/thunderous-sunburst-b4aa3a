(()=>{
  const bust=u=>u+(u.includes('?')?'&':'?')+'_='+Date.now();
  function init(){
    const btn=document.getElementById('refreshDeals');
    if(!btn||btn.dataset.previewScanFix==='1')return;
    btn.dataset.previewScanFix='1';
    btn.onclick=async()=>{
      if(btn.disabled)return;
      const old=btn.textContent;
      btn.disabled=true;
      btn.textContent='Scanning…';
      const status=document.getElementById('dealStatus');
      if(status)status.textContent='Running fresh deal and price-watch scans…';
      try{
        const [dealRes,watchRes]=await Promise.all([
          fetch(bust('/.netlify/functions/scan-deals'),{cache:'no-store'}),
          fetch(bust('/.netlify/functions/price-watch'),{cache:'no-store'})
        ]);
        const dealData=await dealRes.json().catch(()=>({}));
        const watchData=await watchRes.json().catch(()=>({}));
        if(!dealRes.ok||dealData.ok===false)throw Error(dealData.error||`Deal scan returned ${dealRes.status}`);
        if(!watchRes.ok||watchData.ok===false)throw Error(watchData.error||`Price-watch scan returned ${watchRes.status}`);
        if(typeof window.loadDeals==='function')await window.loadDeals();
        else if(typeof loadDeals==='function')await loadDeals();
        else location.reload();
      }catch(e){
        if(status){status.textContent='Deal refresh failed: '+e.message;status.className='bad';}
      }finally{
        btn.disabled=false;
        btn.textContent=old;
      }
    };
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();
