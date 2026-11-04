(()=>{
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=n=>{const v=Number(n);return Number.isFinite(v)?'$'+v.toFixed(2):'$0.00'};
  const safeDate=v=>{try{const d=new Date(v);return Number.isNaN(d.getTime())?String(v||''):d.toLocaleString()}catch{return String(v||'')}};
  async function getJson(path){
    const url=new URL(path,window.location.origin);url.searchParams.set('_',String(Date.now()));
    const r=await fetch(url.href,{cache:'no-store',headers:{accept:'application/json'}});
    const text=await r.text();
    let d={};try{d=text?JSON.parse(text):{}}catch{throw Error(`tracker endpoint returned non-JSON (${r.status}, ${r.headers.get('content-type')||'unknown content type'})`)}
    if(!r.ok)throw Error(d.error||`tracker endpoint returned ${r.status}`);
    return d;
  }
  function renderTop20(box,d){
    const list=Array.isArray(d.top20)?d.top20:[];
    if(!list.length){box.innerHTML='<div class="empty">No rankings yet. Tap Refresh to run the first scan.</div>';return}
    box.innerHTML=list.map(x=>`<div class="item"><div class="row"><div><b>#${Number(x.rank)||0} ${esc(x.name)}</b><div class="muted">${esc(x.set_name||x.set||'')} • #${esc(x.collector_number||'')} • ${money(x.price)}</div></div><span class="pill">${Number(x.score||0).toFixed(1)}</span></div><div style="margin:6px 0"><span class="pill"><b>${esc(x.action||'WATCH')}</b></span><span class="pill">${Number(x.confidence||0)}% confidence</span></div><div class="muted">${esc(x.reason||'Watch signal')}</div>${x.scryfall_uri?`<a href="${esc(x.scryfall_uri)}" rel="noopener" style="display:block;margin-top:8px;color:#93c5fd">View exact printing</a>`:''}</div>`).join('');
  }
  async function recover(){
    const status=document.getElementById('trackerStatus'),box=document.getElementById('top20Box');
    if(!status||!box||!/^Tracker unavailable:/i.test(status.textContent||''))return;
    const original=status.textContent;
    status.textContent='Safari recovery: checking tracker endpoint…';status.className='notice';
    try{const d=await getJson('/.netlify/functions/top20');renderTop20(box,d);status.textContent=d.updated_at?`Updated ${safeDate(d.updated_at)} • ${Number(d.candidate_count||0)} candidates ranked • Safari-safe mode`:(d.message||'Waiting for first tracker run');status.className='notice'}catch(e){status.textContent=`${original} • Recovery diagnostic: ${e.message}`;status.className='bad'}
  }
  const observer=new MutationObserver(()=>recover());
  function boot(){const status=document.getElementById('trackerStatus');if(status)observer.observe(status,{childList:true,subtree:true,characterData:true});recover()}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot);else boot();
})();
