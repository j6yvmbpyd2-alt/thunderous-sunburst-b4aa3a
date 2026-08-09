import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const MIN_SALES=Number(process.env.BREAKOUT_MIN_SALES||8);
const MIN_MULTIPLIER=Number(process.env.BREAKOUT_MIN_MULTIPLIER||2.5);
const HISTORY_POINTS=168;

function keyFor(x){return String(x.scryfall_id||x.card_id||x.name||'').toLowerCase()}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}

async function fetchSalesFeeds(){
  const urls=String(process.env.SALES_FEED_URLS||'').split(',').map(x=>x.trim()).filter(Boolean);
  const rows=[];
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{accept:'application/json'},signal:AbortSignal.timeout(6000)});
      if(!r.ok) continue;
      const d=await r.json();
      const items=Array.isArray(d)?d:(Array.isArray(d.sales)?d.sales:[]);
      for(const x of items) rows.push({...x,source:x.source||new URL(url).hostname});
    }catch{}
  }
  return rows;
}

export default async()=>{
  try{
    const s=store();
    const previous=await s.get('breakout-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
    const history=previous?.history&&typeof previous.history==='object'?previous.history:{};
    const oldActive=new Set((previous?.breakouts||[]).map(x=>x.key));
    const incoming=await fetchSalesFeeds();
    const grouped=new Map();

    for(const row of incoming){
      const key=keyFor(row); if(!key) continue;
      const sold=Number(row.sold_count??row.units_sold??row.quantity_sold??0);
      if(!(sold>=0)) continue;
      const prev=grouped.get(key)||{...row,key,sold_count:0};
      prev.sold_count+=sold;
      if(Number(row.price)>0) prev.price=Number(row.price);
      grouped.set(key,prev);
    }

    const now=Date.now();
    const ranked=[];
    for(const [key,row] of grouped){
      const points=Array.isArray(history[key])?history[key]:[];
      const baselineValues=points.slice(-24).map(x=>Number(x.sold_count)).filter(x=>x>=0);
      const baseline=avg(baselineValues);
      const multiplier=baseline>0?row.sold_count/baseline:(row.sold_count>=MIN_SALES?row.sold_count:1);
      const pricePoints=points.slice(-24).map(x=>Number(x.price)).filter(x=>x>0);
      const oldPrice=pricePoints.length?pricePoints[0]:null;
      const priceChange=oldPrice&&row.price?((row.price-oldPrice)/oldPrice)*100:0;
      const score=Math.round((row.sold_count*2+Math.max(0,multiplier-1)*15+Math.max(0,priceChange)*1.5)*10)/10;
      const active=row.sold_count>=MIN_SALES&&multiplier>=MIN_MULTIPLIER;
      history[key]=[...points,{t:now,sold_count:row.sold_count,price:Number(row.price)||null}].slice(-HISTORY_POINTS);
      if(active) ranked.push({key,name:row.name||'Unknown card',set:row.set||null,collector_number:row.collector_number||null,sold_count:row.sold_count,baseline:Number(baseline.toFixed(2)),multiplier:Number(multiplier.toFixed(2)),price:Number(row.price)||null,price_change_24h:Number(priceChange.toFixed(2)),score,source:row.source||'sales feed',url:row.url||''});
    }

    const breakouts=ranked.sort((a,b)=>b.score-a.score).slice(0,20);
    const fresh=breakouts.filter(x=>!oldActive.has(x.key));
    const payload={ok:true,updated_at:new Date().toISOString(),feed_count:String(process.env.SALES_FEED_URLS||'').split(',').filter(Boolean).length,breakouts,history};
    await s.setJSON('breakout-tracker',payload);

    if(fresh.length){
      const x=fresh[0];
      await sendPush({title:'MTG Breakout Alert',body:`${x.name}: ${x.sold_count} sold this hour — ${x.multiplier}× its recent baseline`,url:'/?tab=tracker',tag:`breakout-${x.key}`}).catch(()=>{});
    }
    return json({...payload,history:undefined,new_breakouts:fresh.map(x=>x.name)});
  }catch(e){return json({ok:false,error:e.message||'Breakout scan failed'},500)}
};
