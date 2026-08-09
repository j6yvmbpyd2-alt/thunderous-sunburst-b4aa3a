(()=>{
  const money=n=>Number(n||0).toLocaleString(undefined,{style:'currency',currency:'USD'});
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function activate(btn,panel){
    document.querySelectorAll('nav button').forEach(x=>x.classList.remove('active'));
    document.querySelectorAll('.panel').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active'); panel.classList.add('active');
  }
  function keyBytes(base64){
    const pad='='.repeat((4-base64.length%4)%4),raw=atob((base64+pad).replace(/-/g,'+').replace(/_/g,'/'));
    return Uint8Array.from([...raw].map(c=>c.charCodeAt(0)));
  }
  async function enablePush(status){
    try{
      if(!('Notification'in window)||!('serviceWorker'in navigator)||!('PushManager'in window)) throw Error('Push notifications are not supported here.');
      const cfg=await fetch('/.netlify/functions/push-config',{cache:'no-store'}).then(r=>r.json());
      if(!cfg.configured||!cfg.publicKey) throw Error('Push is ready in the app, but VAPID keys still need to be added in Netlify.');
      const permission=await Notification.requestPermission();
      if(permission!=='granted') throw Error('Notification permission was not granted.');
      const reg=await navigator.serviceWorker.ready;
      let sub=await reg.pushManager.getSubscription();
      if(!sub) sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:keyBytes(cfg.publicKey)});
      const r=await fetch('/.netlify/functions/push-subscribe',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(sub)});
      if(!r.ok) throw Error('Could not save this phone subscription.');
      status.textContent='Notifications enabled on this device.'; status.className='good';
    }catch(e){status.textContent=e.message;status.className='bad';}
  }
  async function loadTop20(box,status){
    status.textContent='Refreshing tracker…';
    try{
      const d=await fetch('/.netlify/functions/top20',{cache:'no-store'}).then(r=>r.json());
      const list=d.top20||[];
      status.textContent=d.updated_at?`Updated ${new Date(d.updated_at).toLocaleString()} • ${d.candidate_count||0} candidates ranked`:(d.message||'Waiting for first tracker run');
      if(!list.length){box.innerHTML='<div class="empty">No rankings yet. Run the scheduled top20-run function once in Netlify to seed the tracker.</div>';return;}
      box.innerHTML=list.map(x=>`<div class="item"><div class="row"><div><b>#${x.rank} ${esc(x.name)}</b><div class="muted">${esc(x.set_name||x.set)} • ${money(x.price)}</div></div><span class="pill">${Number(x.score||0).toFixed(1)}</span></div><div class="muted">${esc(x.reason||'Watch signal')}</div>${Number(x.drop24)<0?`<span class="pill good">24h ${Number(x.drop24).toFixed(1)}%</span>`:''}${Number(x.drop72)<0?`<span class="pill good">72h ${Number(x.drop72).toFixed(1)}%</span>`:''}${x.scryfall_uri?`<a href="${esc(x.scryfall_uri)}" style="display:block;margin-top:8px;color:#93c5fd">View card</a>`:''}</div>`).join('');
    }catch(e){status.textContent='Tracker unavailable: '+e.message;box.innerHTML='';}
  }
  function init(){
    const nav=document.querySelector('nav'),main=document.querySelector('main'); if(!nav||!main||document.getElementById('tracker')) return;
    const btn=document.createElement('button'); btn.dataset.tab='tracker'; btn.textContent='Top 20';
    const settingsBtn=nav.querySelector('[data-tab="settings"]'); nav.insertBefore(btn,settingsBtn||null);
    const panel=document.createElement('section'); panel.id='tracker'; panel.className='panel';
    panel.innerHTML='<div class="card"><div class="row"><div><h2>Top 20 Cards to Watch</h2><div class="muted">Hourly ranking of high-demand cards with price-drop signals.</div></div><button id="refreshTop20" class="secondary" style="width:auto;margin:0;padding:8px 10px">Refresh</button></div><div id="trackerStatus" class="notice" style="margin-top:12px">Loading…</div><div id="top20Box"></div></div><div class="card"><h2>Push notifications</h2><div class="muted">Get alerts for target-price hits and cards entering the Top 20.</div><button id="enablePush">Enable Notifications</button><div id="pushStatus" class="muted" style="margin-top:8px"></div></div>';
    main.appendChild(panel);
    btn.onclick=()=>{activate(btn,panel);loadTop20(document.getElementById('top20Box'),document.getElementById('trackerStatus'));};
    document.getElementById('refreshTop20').onclick=()=>loadTop20(document.getElementById('top20Box'),document.getElementById('trackerStatus'));
    document.getElementById('enablePush').onclick=()=>enablePush(document.getElementById('pushStatus'));
    if(new URL(location.href).searchParams.get('tab')==='tracker'){btn.click();}
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init); else init();
})();
