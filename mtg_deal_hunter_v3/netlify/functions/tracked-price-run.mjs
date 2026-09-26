import { store } from './_shared.mjs';

const MAX_REGISTRY=2000,BATCH=250,HOURLY_KEEP=168,DAILY_KEEP=120;
function price(c,f){const p=c?.prices||{};if(f==='foil')return Number(p.usd_foil)||null;if(f==='etched')return Number(p.usd_etched)||null;return Number(p.usd)||null}

export default async()=>{
  const s=store(),registry=(await s.get('searched-card-registry',{type:'json',consistency:'strong'}).catch(()=>null))||{cards:[],cursor:0};
  const cards=Array.isArray(registry.cards)?registry.cards.slice(-MAX_REGISTRY):[];
  if(!cards.length){await s.setJSON('searched-price-history',{updated_at:new Date().toISOString(),cards:{}});return}
  const start=Number(registry.cursor||0)%cards.length,batch=[];
  for(let i=0;i<Math.min(BATCH,cards.length);i++)batch.push(cards[(start+i)%cards.length]);
  const existing=(await s.get('searched-price-history',{type:'json',consistency:'strong'}).catch(()=>null))||{cards:{}};
  const histories=existing.cards&&typeof existing.cards==='object'?existing.cards:{},now=Date.now(),date=new Date().toISOString().slice(0,10);
  for(let i=0;i<batch.length;i+=75){
    const group=batch.slice(i,i+75),r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{'content-type':'application/json','user-agent':'MTGDealHunter/4.9 searched-history','accept':'application/json'},body:JSON.stringify({identifiers:group.map(x=>({id:x.id}))})});
    if(!r.ok)continue;const d=await r.json(),byId=new Map((d.data||[]).map(c=>[c.id,c]));
    for(const item of group){const c=byId.get(item.id);if(!c)continue;const p=price(c,item.finish||'nonfoil');if(!(p>0))continue;const k=item.id+'|'+(item.finish||'nonfoil'),old=histories[k]||{id:item.id,finish:item.finish||'nonfoil',name:item.name,set:item.set,collector_number:item.collector_number,hourly:[],daily:[]},hourly=[...(old.hourly||[]),{t:now,price:p}].slice(-HOURLY_KEEP),daily=[...(old.daily||[])];if(!daily.length||daily.at(-1).date!==date)daily.push({date,price:p});else daily[daily.length-1]={date,price:p};histories[k]={...old,hourly,daily:daily.slice(-DAILY_KEEP),last_price:p,last_checked:now};}
    if(i+75<batch.length)await new Promise(r=>setTimeout(r,120));
  }
  const next=(start+batch.length)%cards.length;
  await Promise.all([s.setJSON('searched-price-history',{updated_at:new Date().toISOString(),cards:histories}),s.setJSON('searched-card-registry',{...registry,cards,cursor:next,last_run:new Date().toISOString()})]);
};