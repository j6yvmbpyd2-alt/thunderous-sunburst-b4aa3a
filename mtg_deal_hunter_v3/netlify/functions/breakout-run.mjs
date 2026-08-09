import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const MIN_SALES=Number(process.env.BREAKOUT_MIN_SALES||8);
const MIN_MULTIPLIER=Number(process.env.BREAKOUT_MIN_MULTIPLIER||2.5);
const HISTORY_POINTS=168;

function keyFor(x){return String(x.scryfall_id||x.card_id||x.id||x.name||'').toLowerCase()}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:0}
function pct(a,b){return a>0&&b>0?((a-b)/b)*100:0}

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
  return {rows,feedCount:urls.length};
}

function buildMomentum(topData){
  const history=topData?.history&&typeof topData.history==='object'?topData.history:{};
  const top=Array.isArray(topData?.top20)?topData.top20:[];
  const rows=[];
  for(const card of top){
    const points=Array.isArray(history[card.id])?history[card.id]:[];
    const prices=points.map(x=>Number(x.price)).filter(x=>x>0);
    if(prices.length<2) continue;
    const current=Number(card.price)||prices.at(-1);
    const avg6=avg(prices.slice(-6));
    const avg24=avg(prices.slice(-24));
    const change6=pct(current,avg6);
    const change24=pct(current,avg24);
    const prior=prices.length>1?prices.at(-2):current;
    const lastHour=pct(current,prior);
    const demand=Math.max(0,21-Number(card.rank||20));
    const acceleration=Math.max(0,change6)*4+Math.max(0,change24)*2+Math.max(0,lastHour)*5;
    const score=Math.round((acceleration+demand)*10)/10;
    const active=(change6>=2||lastHour>=1.5||change24>=4)&&score>=12;
    if(!active) continue;
    const reasons=[];
    if(lastHour>=1.5) reasons.push(`price +${lastHour.toFixed(1)}% since last check`);
    if(change6>=2) reasons.push(`+${change6.toFixed(1)}% vs recent 6h average`);
    if(change24>=4) reasons.push(`+${change24.toFixed(1)}% vs 24h average`);
    if(Number(card.rank)<=10) reasons.push(`Top ${card.rank} demand watch`);
    rows.push({
      key:keyFor(card),type:'momentum',verified_sales:false,name:card.name,set:card.set||null,set_name:card.set_name||null,
      collector_number:card.collector_number||null,price:current,price_change_1h:Number(lastHour.toFixed(2)),
      price_change_6h:Number(change6.toFixed(2)),price_change_24h:Number(change24.toFixed(2)),score,
      source:'Top 20 price-history momentum',reason:reasons.join(' • '),url:card.scryfall_uri||''
    });
  }
  return rows.sort((a,b)=>b.score-a.score).slice(0,20);
}

export default async()=>{
  try{
    const s=store();
    const previous=await s.get('breakout-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
    const history=previous?.history&&typeof previous.history==='object'?previous.history:{};
    const oldActive=new Set((previous?.breakouts||[]).map(x=>x.key));
    const {rows:incoming,feedCount}=await fetchSalesFeeds();
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
    const verified=[];
    for(const [key,row] of grouped){
      const points=Array.isArray(history[key])?history[key]:[];
      const baselineValues=points.slice(-24).map(x=>Number(x.sold_count)).filter(x=>x>=0);
      const baseline=avg(baselineValues);
      const multiplier=baseline>0?row.sold_count/baseline:(row.sold_count>=MIN_SALES?row.sold_count:1);
      const pricePoints=points.slice(-24).map(x=>Number(x.price)).filter(x=>x>0);
      const oldPrice=pricePoints.length?pricePoints[0]:null;
      const priceChange=oldPrice&&row.price?pct(row.price,oldPrice):0;
      const score=Math.round((row.sold_count*2+Math.max(0,multiplier-1)*15+Math.max(0,priceChange)*1.5)*10)/10;
      const active=row.sold_count>=MIN_SALES&&multiplier>=MIN_MULTIPLIER;
      history[key]=[...points,{t:now,sold_count:row.sold_count,price:Number(row.price)||null}].slice(-HISTORY_POINTS);
      if(active) verified.push({key,type:'verified-sales',verified_sales:true,name:row.name||'Unknown card',set:row.set||null,collector_number:row.collector_number||null,sold_count:row.sold_count,baseline:Number(baseline.toFixed(2)),multiplier:Number(multiplier.toFixed(2)),price:Number(row.price)||null,price_change_24h:Number(priceChange.toFixed(2)),score,source:row.source||'sales feed',reason:`${row.sold_count} sold • ${Number(multiplier.toFixed(2))}× recent baseline`,url:row.url||''});
    }

    let mode='verified-sales';
    let breakouts=verified.sort((a,b)=>b.score-a.score).slice(0,20);
    if(!feedCount){
      mode='momentum';
      const topData=await s.get('top20-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
      breakouts=buildMomentum(topData);
    }

    const fresh=breakouts.filter(x=>!oldActive.has(x.key));
    const payload={ok:true,updated_at:new Date().toISOString(),mode,feed_count:feedCount,breakouts,history};
    await s.setJSON('breakout-tracker',payload);

    if(fresh.length){
      const x=fresh[0];
      const push=x.verified_sales
        ? {title:'MTG Verified Breakout',body:`${x.name}: ${x.sold_count} sold this hour — ${x.multiplier}× baseline`}
        : {title:'MTG Momentum Alert',body:`${x.name}: ${x.reason}`};
      await sendPush({...push,url:'/?tab=tracker',tag:`breakout-${x.key}`}).catch(()=>{});
    }
    return json({...payload,history:undefined,new_breakouts:fresh.map(x=>x.name)});
  }catch(e){return json({ok:false,error:e.message||'Breakout scan failed'},500)}
};
