(()=>{
  async function upsert(card,opts={}){
    const set=String(card.set||card.set_code||'').toLowerCase(),collectorNumber=String(card.collectorNumber||card.collector_number||card.num||''),finish=String(card.finish||'nonfoil').toLowerCase(),name=card.name||'this card';
    if(!set||!collectorNumber){alert('This exact printing is missing its set code or collector number.');return false}
    const suggested=Number(opts.suggestedTarget||card.target||card.max_buy||card.price||0),raw=prompt(`Add or update hourly server target for ${name}:`,suggested>0?suggested.toFixed(2):'');
    if(raw===null)return false;const target=Number(raw);if(!(target>0)){alert('Enter a target price greater than $0.');return false}
    const btn=opts.button,old=btn?.textContent;if(btn){btn.disabled=true;btn.textContent='Saving…'}
    try{
      const r=await fetch('/.netlify/functions/price-watch-config',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({action:'upsert',set,collectorNumber,finish,target}),cache:'no-store'}),d=await r.json().catch(()=>({}));
      if(!r.ok||d.ok===false)throw Error(d.error||'Could not save server watch.');
      await fetch(`/.netlify/functions/price-watch-now?_=${Date.now()}`,{cache:'no-store'}).catch(()=>{});
      try{await window.loadDeals?.()}catch{}
      if(btn){btn.textContent='Server Watch Saved';setTimeout(()=>{btn.textContent=old||'Add Server Watch'},1300)}
      return true;
    }catch(e){alert(e.message||'Could not save server watch.');if(btn)btn.textContent=old||'Add Server Watch';return false}
    finally{if(btn)btn.disabled=false}
  }
  window.addOrUpdateServerWatch=upsert;
})();