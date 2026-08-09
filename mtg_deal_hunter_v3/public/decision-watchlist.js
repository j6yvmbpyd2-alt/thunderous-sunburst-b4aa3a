(()=>{
  const WATCH_KEY='mtgWatchV2',HISTORY_KEY='mtgHistoryV2';
  const moneyText=s=>Number(String(s||'').replace(/[^0-9.]/g,''))||0;
  const load=(k)=>{try{return JSON.parse(localStorage.getItem(k)||'[]')}catch{return[]}};
  const save=(k,v)=>localStorage.setItem(k,JSON.stringify(v));
  function exactMeta(card){
    const h2=card.querySelector('h2');
    if(!h2)return null;
    const name=h2.textContent.trim();
    const muted=h2.parentElement?.querySelector('.muted')?.textContent||'';
    const m=muted.match(/^(.*?)\s*•\s*#(.+)$/);
    if(!m)return null;
    const setName=m[1].trim(),collector=m[2].trim();
    const current=moneyText(card.querySelector('.price')?.textContent);
    const maxBox=[...card.querySelectorAll('.kpi')].find(x=>/max buy/i.test(x.textContent||''));
    const target=moneyText(maxBox?.querySelector('b')?.textContent||'');
    return{name,setName,collector,current,target};
  }
  async function resolveExact(meta){
    const q=`!${meta.name} set:${meta.setName}`;
    try{
      const r=await fetch(`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(meta.name)}&set=${encodeURIComponent(meta.setName)}`,{cache:'no-store'});
      if(r.ok){const c=await r.json();if(String(c.collector_number)===String(meta.collector))return c;}
    }catch{}
    try{
      const r=await fetch(`https://api.scryfall.com/cards/search?q=${encodeURIComponent(`!"${meta.name}"`)}`,{cache:'no-store'});
      if(r.ok){const d=await r.json();return (d.data||[]).find(c=>String(c.collector_number)===String(meta.collector)&&String(c.set_name).toLowerCase()===String(meta.setName).toLowerCase())||null;}
    }catch{}
    return null;
  }
  function addHistory(id,p){if(!p)return;const h=load(HISTORY_KEY);h.push({id,p:+p,t:Date.now()});save(HISTORY_KEY,h.slice(-1000));}
  function refreshExistingUI(){try{if(typeof window.renderWatch==='function')window.renderWatch()}catch{}}
  async function add(card,btn,status){
    const meta=exactMeta(card);if(!meta){status.textContent='Could not read exact printing from this decision.';status.className='bad';return;}
    btn.disabled=true;btn.textContent='Adding…';status.textContent='Resolving exact printing…';status.className='muted';
    try{
      const exact=await resolveExact(meta);if(!exact)throw Error('Exact Scryfall printing could not be resolved.');
      const a=load(WATCH_KEY),idx=a.findIndex(x=>x.id===exact.id);
      const row={id:exact.id,name:exact.name,set:exact.set_name,num:exact.collector_number,finish:'nonfoil',target:meta.target||'',last:meta.current||'',checked:Date.now()};
      if(idx>=0){a[idx]={...a[idx],...row};status.textContent=`Watch updated • target ${meta.target?'$'+meta.target.toFixed(2):'not set'}.`;btn.textContent='Watchlist Updated';}
      else{a.unshift(row);if(a.length>75)a.length=75;status.textContent=`Added to Watchlist • target ${meta.target?'$'+meta.target.toFixed(2):'not set'}.`;btn.textContent='Added to Watchlist';}
      save(WATCH_KEY,a);addHistory(exact.id,meta.current);refreshExistingUI();status.className='good';
    }catch(e){status.textContent=e.message||'Could not add watch.';status.className='bad';btn.textContent='Add to Watchlist';}
    finally{btn.disabled=false;}
  }
  function enhance(){
    const card=document.getElementById('intelCard');if(!card||!card.querySelector('h2'))return;
    let host=document.getElementById('decisionWatchActions');
    if(host)return;
    host=document.createElement('div');host.id='decisionWatchActions';host.className='notice';host.style.marginTop='12px';
    host.innerHTML='<button id="decisionAddWatch" class="secondary small" style="width:auto;margin:0">Add to Watchlist</button><button id="decisionGoWatch" class="ghost small" style="width:auto;margin:0 0 0 8px">Open Watchlist</button><div id="decisionWatchStatus" class="muted" style="margin-top:7px"></div>';
    const anchor=[...card.querySelectorAll('h2')].find(x=>/why this call/i.test(x.textContent||''));
    if(anchor)card.insertBefore(host,anchor);else card.appendChild(host);
    const meta=exactMeta(card),existing=meta?load(WATCH_KEY).find(x=>x.name===meta.name&&String(x.num)===String(meta.collector)&&String(x.set).toLowerCase()===String(meta.setName).toLowerCase()):null;
    if(existing){document.getElementById('decisionAddWatch').textContent='Update Watchlist Target';document.getElementById('decisionWatchStatus').textContent=`Already watched${existing.target?` • current target $${Number(existing.target).toFixed(2)}`:''}.`;}
    document.getElementById('decisionAddWatch').onclick=()=>add(card,document.getElementById('decisionAddWatch'),document.getElementById('decisionWatchStatus'));
    document.getElementById('decisionGoWatch').onclick=()=>{document.getElementById('intelModal').style.display='none';document.querySelector('[data-tab="watchlist"]')?.click();refreshExistingUI();};
  }
  const obs=new MutationObserver(()=>enhance());
  function init(){obs.observe(document.body,{childList:true,subtree:true});enhance();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();
})();