(()=>{
  const money=n=>Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const bust=u=>u+(u.includes('?')?'&':'?')+'_='+Date.now();
  function svgChart(points){
    const vals=points.map(x=>Number(x.price)).filter(x=>x>0); if(vals.length<2)return '<div class="empty">More hourly snapshots are needed for a price chart.</div>';
    const w=620,h=190,pad=18,min=Math.min(...vals),max=Math.max(...vals),span=Math.max(.01,max-min);
    const coords=vals.map((v,i)=>`${pad+(i/(vals.length-1))*(w-pad*2)},${h-pad-((v-min)/span)*(h-pad*2)}`).join(' ');
    return `<svg viewBox="0 0 ${w} ${h}" style="width:100%;height:auto;background:#0b1424;border:1px solid #26364f;border-radius:12px"><polyline points="${coords}" fill="none" stroke="currentColor" stroke-width="3"/><text x="${pad}" y="14" fill="currentColor" font-size="11">${money(max)}</text><text x="${pad}" y="${h-4}" fill="currentColor" font-size="11">${money(min)}</text></svg>`;
  }
  function ensureModal(){
    if(document.getElementById('intelModal'))return;
    const el=document.createElement('div');el.id='intelModal';el.style='display:none;position:fixed;inset:0;z-index:50;background:rgba(0,0,0,.72);padding:18px;overflow:auto';
    el.innerHTML='<div id="intelCard" class="card" style="max-width:760px;margin:30px auto"></div>';document.body.appendChild(el);
    el.addEventListener('click',e=>{if(e.target===el)el.style.display='none'});
  }
  async function openIntel(id){
    ensureModal();const modal=document.getElementById('intelModal'),card=document.getElementById('intelCard');modal.style.display='block';card.innerHTML='<div class="notice">Loading card intelligence…</div>';
    try{
      const d=await fetch(bust('/.netlify/functions/card-intelligence?id='+encodeURIComponent(id)),{cache:'no-store'}).then(r=>r.json());if(!d.ok)throw Error(d.error||'Unable to load intelligence');
      const x=d.card,i=d.intelligence,h=d.history||[],cls=i.decision==='BUY'?'good':i.decision==='PASS'?'bad':'watch';
      card.innerHTML=`<div class="row"><div><h2>${esc(x.name)}</h2><div class="muted">${esc(x.set_name||x.set)} • #${esc(x.collector_number||'')}</div></div><button id="intelClose" class="secondary" style="width:auto;margin:0">Close</button></div><div style="display:grid;grid-template-columns:${x.image?'130px 1fr':'1fr'};gap:14px;margin-top:12px">${x.image?`<img src="${esc(x.image)}" style="width:130px;border-radius:10px">`:''}<div><div class="price">${money(i.current)}</div><span class="pill ${cls}"><b>${esc(i.decision)}</b></span><span class="pill">Buy Now ${i.buy_confidence}%</span><span class="pill">${esc(i.trend)}</span><div class="grid2" style="margin-top:10px"><div class="kpi"><span class="muted">Fair buy</span><b>${money(i.fair_buy)}</b></div><div class="kpi"><span class="muted">Strong buy</span><b>${money(i.strong_buy)}</b></div></div><div class="muted" style="margin-top:9px">Current price percentile: ${i.percentile==null?'—':i.percentile+'%'} • ${i.history_points} hourly snapshots</div></div></div><div style="margin-top:14px"><h2>Price history</h2>${svgChart(h)}</div><div class="grid3" style="margin-top:12px"><div class="kpi"><span class="muted">24h avg</span><b>${i.avg24?money(i.avg24):'—'}</b></div><div class="kpi"><span class="muted">24h low</span><b>${i.low24?money(i.low24):'—'}</b></div><div class="kpi"><span class="muted">24h high</span><b>${i.high24?money(i.high24):'—'}</b></div></div><div class="notice" style="margin-top:12px">${esc(x.reason||'')}</div>${x.scryfall_uri?`<a href="${esc(x.scryfall_uri)}" style="display:block;margin-top:10px;color:#93c5fd">View exact printing</a>`:''}`;
      document.getElementById('intelClose').onclick=()=>modal.style.display='none';
    }catch(e){card.innerHTML=`<div class="bad">${esc(e.message)}</div><button id="intelClose" class="secondary">Close</button>`;document.getElementById('intelClose').onclick=()=>modal.style.display='none'}
  }
  async function enhance(){
    const box=document.getElementById('top20Box');if(!box)return;
    try{
      const d=await fetch(bust('/.netlify/functions/top20'),{cache:'no-store'}).then(r=>r.json());const items=[...box.querySelectorAll('.item')];
      (d.top20||[]).forEach((x,i)=>{const item=items[i];if(!item||item.querySelector('.intel-btn'))return;const b=document.createElement('button');b.className='secondary small intel-btn';b.style='width:auto;margin-top:8px';b.textContent='Card Intelligence';b.onclick=()=>openIntel(x.id);item.appendChild(b)});
    }catch{}
  }
  const obs=new MutationObserver(()=>enhance());
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>{ensureModal();const box=document.getElementById('top20Box');if(box)obs.observe(box,{childList:true});enhance()});else{ensureModal();const box=document.getElementById('top20Box');if(box)obs.observe(box,{childList:true});enhance()}
})();
