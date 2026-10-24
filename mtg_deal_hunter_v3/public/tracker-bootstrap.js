(()=>{
  const findButton=()=>[...document.querySelectorAll('nav button')].find(b=>b.dataset.tab==='tracker'||b.textContent.trim()==='Trackers');
  const showError=msg=>{
    let el=document.getElementById('trackerBootDiagnostic');
    if(!el){el=document.createElement('div');el.id='trackerBootDiagnostic';el.className='bad';el.style='padding:8px 16px;font-size:12px;border-bottom:1px solid #7f1d1d;background:#2a1018';document.querySelector('header')?.insertAdjacentElement('afterend',el)}
    el.textContent='Tracker startup issue: '+msg;
  };
  function boot(){
    const nav=document.querySelector('nav'),main=document.querySelector('main');
    if(!nav||!main){showError('base navigation was not found');return}
    if(findButton())return;
    const orphan=document.getElementById('tracker');
    if(orphan)orphan.remove();
    const old=[...document.scripts].find(s=>s.src.includes('/tracker-ui.js'));
    if(old)old.remove();
    const s=document.createElement('script');
    s.src='/tracker-ui.js?v=35&_='+Date.now();
    s.async=false;
    s.onload=()=>setTimeout(()=>{if(!findButton())showError('tracker-ui.js loaded but did not create the Trackers tab')},50);
    s.onerror=()=>showError('tracker-ui.js could not be loaded');
    document.body.appendChild(s);
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>setTimeout(boot,0));else setTimeout(boot,0);
})();
