(()=>{
  async function getConfig(){try{const r=await fetch('/.netlify/functions/price-watch-config',{cache:'no-store'});const d=await r.json();return d.ok?d.watches||[]:[]}catch{return[]}}
  function key(x){return `${String(x.set||'').toLowerCase()}|${String(x.collectorNumber||x.collector_number||'')}|${String(x.finish||'nonfoil').toLowerCase()}`}
  async function upsert(card,opts={}){
    const set=String(card.set||card.set_code||'').toLowerCase(),collectorNumber=String(card.collectorNumber||card.collector_number||card.num||''),finish=String(card.finish||'nonfoil').toLowerCase(),name=card.name||'this card';
    if(!set||!collectorNumber){alert('This exact printing is missing its set code or collector number.');return false}
    const watches=await getConfig(),existing=watches.find(w=>key(w)===key({set,collectorNumber,finish})),suggested=Number(existing?.target||opts.suggestedTarget||card.target||card.max_buy||card.price||0),raw=prompt(`${existing?'Update':'Add'} hourly server target for ${name}:`,suggested>0?suggested.toFixed(2):'');
    if(raw===null)return false;const target=Number(raw);if(!(target>0)){alert('Enter a target price greater than $0.');return false}
    const r=await fetch('/.netlify/functions/price-watch-config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'upsert',set,collectorNumber,finish,target}),cache:'no-store'}),d=await r.json().catch(()=>({}));if(!r.ok||d.ok===false){alert(d.error||'Could not save server watch.');return false}
    await fetch(`/.netlify/functions/price-watch-now?_=${Date.now()}`,{cache:'no-store'}).catch(()=>{});window.loadDeals?.();
    if(opts.button){opts.button.textContent='Server Watch Saved';setTimeout(()=>opts.button.textContent=existing?'Update Server Watch':'Add Server Watch',1300)}
    return true;
  }
  window.addOrUpdateServerWatch=upsert;
})();