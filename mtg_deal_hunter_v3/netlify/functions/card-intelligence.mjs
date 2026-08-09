import { json, store } from "./_shared.mjs";

const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const pct=(a,b)=>a>0&&b>0?((a-b)/b)*100:0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function quantile(sorted,q){if(!sorted.length)return null;const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo)}
function trend(prices){if(prices.length<2)return 'Building history';const last=prices.at(-1),prev=prices.at(-2),a6=avg(prices.slice(-6)),a24=avg(prices.slice(-24)),one=pct(last,prev),v6=a6?pct(last,a6):0,v24=a24?pct(last,a24):0;if(one>=4&&v24>=3)return'Overheated';if(one>=1&&v6<=0)return'Reversing';if(one>0&&v6>0)return'Rising';if(one<=0&&v6<=-2)return'Falling';if(Math.abs(one)<1&&Math.abs(v6)<1.5)return'Bottoming';return one>=0?'Firming':'Softening'}
async function historicalFor(req,id){try{const r=await fetch(new URL('/data/mtgjson-history.json',req.url),{cache:'no-store',signal:AbortSignal.timeout(4000)});if(!r.ok)return null;const d=await r.json(),rec=d?.cards?.[id];if(!rec||!Array.isArray(rec.points))return null;return{meta:{source:d.source,provider:rec.provider||d.provider,resolution:d.resolution||'daily',finish:rec.finish||'normal',list:rec.list||'retail'},points:rec.points}}catch{return null}}

export default async req=>{
  try{
    const id=new URL(req.url).searchParams.get('id');if(!id)return json({ok:false,error:'Missing card id'},400);
    const data=await store().get('top20-tracker',{type:'json',consistency:'strong'}).catch(()=>null);if(!data)return json({ok:false,error:'Tracker has not run yet'},404);
    const card=(data.top20||[]).find(x=>x.id===id),livePoints=Array.isArray(data.history?.[id])?data.history[id]:[];if(!card)return json({ok:false,error:'Card is not in the current Top 20'},404);
    const hist=await historicalFor(req,id),daily=(hist?.points||[]).map(x=>({t:Date.parse(x.date+'T12:00:00Z'),price:Number(x.price),source:'MTGJSON daily'})).filter(x=>x.t&&x.price>0),live=livePoints.map(x=>({t:Number(x.t),price:Number(x.price),source:'live hourly'})).filter(x=>x.t&&x.price>0),historicalPrices=daily.map(x=>x.price),livePrices=live.map(x=>x.price),current=Number(card.price)||livePrices.at(-1)||historicalPrices.at(-1)||null,historicalCurrent=historicalPrices.at(-1)||null;
    const daily30=historicalPrices.slice(-30),daily90=historicalPrices.slice(-90),sorted90=[...daily90].sort((a,b)=>a-b),med=quantile(sorted90,.5),q25=quantile(sorted90,.25),q10=quantile(sorted90,.10),mean=avg(daily90),fairBuy=med?Math.min(med*.96,q25||med):historicalCurrent||current,strongBuy=q10?Math.min(q10,fairBuy*.94):fairBuy?fairBuy*.94:historicalCurrent||current;
    const percentile=sorted90.length&&historicalCurrent?Math.round((sorted90.filter(x=>x<=historicalCurrent).length/sorted90.length)*100):null,sourceGap=historicalCurrent&&current?Math.abs(pct(current,historicalCurrent)):null,pricingConsistency=sourceGap==null?45:sourceGap<=8?95:sourceGap<=15?85:sourceGap<=25?70:sourceGap<=40?55:35;
    const historicalConfidence=clamp(Math.round(historicalPrices.length/90*95),0,95),liveConfidence=clamp(Math.round(livePrices.length/24*95),5,95),edge=fairBuy&&historicalCurrent?Math.max(0,pct(fairBuy,historicalCurrent)):0,modelConfidence=Number(card.confidence)||50;
    let buyConfidence=clamp(Math.round(modelConfidence*.25+historicalConfidence*.30+liveConfidence*.15+pricingConsistency*.20+Math.min(10,edge)),20,97);
    if(pricingConsistency<80)buyConfidence=Math.min(buyConfidence,84);if(pricingConsistency<65)buyConfidence=Math.min(buyConfidence,69);if(pricingConsistency<50)buyConfidence=Math.min(buyConfidence,54);
    const liveTrend=trend(livePrices.length?livePrices:historicalPrices.slice(-7));let decision='WAIT';
    if(historicalCurrent&&strongBuy&&historicalCurrent<=strongBuy&&buyConfidence>=70&&pricingConsistency>=65)decision='BUY';else if(historicalCurrent&&fairBuy&&historicalCurrent<=fairBuy&&buyConfidence>=60&&pricingConsistency>=65)decision='BUY';else if(card.action==='PASS'||liveTrend==='Overheated')decision='PASS';
    const range24=livePrices.slice(-24),all=[...daily,...live].sort((a,b)=>a.t-b.t);
    return json({ok:true,card,intelligence:{current,historical_current:historicalCurrent,source_gap_pct:sourceGap==null?null:+sourceGap.toFixed(2),pricing_consistency:pricingConsistency,mean,median:med,fair_buy:fairBuy,strong_buy:strongBuy,percentile,trend:liveTrend,decision,buy_confidence:buyConfidence,historical_confidence:historicalConfidence,live_confidence:liveConfidence,historical_points:historicalPrices.length,live_points:livePrices.length,history_points:all.length,avg24:avg(range24),low24:range24.length?Math.min(...range24):null,high24:range24.length?Math.max(...range24):null,avg30:avg(daily30),low30:daily30.length?Math.min(...daily30):null,high30:daily30.length?Math.max(...daily30):null,avg90:avg(daily90),low90:daily90.length?Math.min(...daily90):null,high90:daily90.length?Math.max(...daily90):null,history_source:hist?.meta||null},history:all});
  }catch(e){return json({ok:false,error:e.message||'Intelligence lookup failed'},500)}
};
