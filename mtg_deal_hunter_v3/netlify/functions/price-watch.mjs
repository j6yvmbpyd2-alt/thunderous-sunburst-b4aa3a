import { store, json, referencePriceForCard } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";
import { getConfiguredWatches } from './price-watch-config.mjs';

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));

export default async () => {
  const watches = (await getConfiguredWatches()).slice(0,40);
  const results = [];
  const s=store();
  const previous=await s.get("price-watches",{type:"json",consistency:"strong"}).catch(()=>null);
  const prevHitIds=new Set((previous?.watches||[]).filter(x=>x.hit).map(x=>`${x.set}|${x.collector_number}|${x.finish}`));

  for (const watch of watches) {
    try {
      const url = `https://api.scryfall.com/cards/${encodeURIComponent(watch.set.toLowerCase())}/${encodeURIComponent(watch.collectorNumber)}`;
      const r = await fetch(url, { headers: { "user-agent": "MTGDealHunter/5.4", "accept": "application/json" } });
      if (!r.ok) throw new Error(`Scryfall ${r.status}`);
      const card = await r.json();
      const ref = await referencePriceForCard(card, watch.finish);
      const price = ref.price;
      results.push({id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector_number:card.collector_number,finish:watch.finish,price,price_source:ref.source,target:watch.target,hit:Boolean(price!=null&&watch.target!=null&&price<=watch.target),scryfall_uri:card.scryfall_uri,tcgplayer_id:card.tcgplayer_id||null,checked_at:new Date().toISOString()});
    } catch (error) {
      results.push({ set:watch.set,collector_number:watch.collectorNumber,finish:watch.finish,target:watch.target,error: error.message, checked_at: new Date().toISOString() });
    }
    await sleep(110);
  }

  const sources=[...new Set(results.map(x=>x.price_source).filter(Boolean))];
  const payload={ok:true,source:sources.length===1?sources[0]:(sources.length?sources.join(" + "):"No price source"),configured:watches.length,hits:results.filter(x=>x.hit).length,updated_at:new Date().toISOString(),watches:results};
  await s.setJSON("price-watches",payload).catch(()=>{});

  for(const hit of results.filter(x=>x.hit)){
    const key=`${hit.set}|${hit.collector_number}|${hit.finish}`;
    if(!prevHitIds.has(key)){
      await sendPush({title:"MTG Target Hit",body:`${hit.name} is ${Number(hit.price).toLocaleString(undefined,{style:'currency',currency:'USD'})} — target ${Number(hit.target).toLocaleString(undefined,{style:'currency',currency:'USD'})}`,url:"/?tab=deals",tag:`target-${key}`}).catch(()=>{});
    }
  }
  return json(payload);
};