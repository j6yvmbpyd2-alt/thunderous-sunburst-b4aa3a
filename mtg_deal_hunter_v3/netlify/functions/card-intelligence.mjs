import { json, store } from "./_shared.mjs";

function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pct(a,b){return a>0&&b>0?((a-b)/b)*100:0}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function quantile(sorted,q){
  if(!sorted.length)return null;
  const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo);
}
function trend(prices){
  if(prices.length<2)return 'Building history';
  const last=prices.at(-1),prev=prices.at(-2),a6=avg(prices.slice(-6)),a24=avg(prices.slice(-24));
  const one=pct(last,prev),v6=a6?pct(last,a6):0,v24=a24?pct(last,a24):0;
  if(one>=4&&v24>=3)return 'Overheated';
  if(one>=1&&v6<=0)return 'Reversing';
  if(one>0&&v6>0)return 'Rising';
  if(one<=0&&v6<=-2)return 'Falling';
  if(Math.abs(one)<1&&Math.abs(v6)<1.5)return 'Bottoming';
  return one>=0?'Firming':'Softening';
}

async function historicalFor(req,id){
  try{
    const url=new URL('/data/mtgjson-history.json',req.url);
    const r=await fetch(url,{cache:'no-store',signal:AbortSignal.timeout(4000)});
    if(!r.ok)return null;
    const d=await r.json();
    const rec=d?.cards?.[id];
    if(!rec||!Array.isArray(rec.points))return null;
    return {meta:{source:d.source,provider:rec.provider||d.provider,resolution:d.resolution||'daily'},points:rec.points};
  }catch{return null}
}

export default async(req)=>{
  try{
    const id=new URL(req.url).searchParams.get('id');
    if(!id)return json({ok:false,error:'Missing card id'},400);
    const data=await store().get('top20-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
    if(!data)return json({ok:false,error:'Tracker has not run yet'},404);
    const card=(data.top20||[]).find(x=>x.id===id);
    const livePoints=Array.isArray(data.history?.[id])?data.history[id]:[];
    if(!card)return json({ok:false,error:'Card is not in the current Top 20'},404);

    const hist=await historicalFor(req,id);
    const daily=(hist?.points||[]).map(x=>({t:Date.parse(x.date+'T12:00:00Z'),price:Number(x.price),source:'MTGJSON daily'})).filter(x=>x.t&&x.price>0);
    const live=livePoints.map(x=>({t:Number(x.t),price:Number(x.price),source:'live hourly'})).filter(x=>x.t&&x.price>0);
    const all=[...daily,...live].sort((a,b)=>a.t-b.t);
    const historicalPrices=daily.map(x=>x.price);
    const livePrices=live.map(x=>x.price);
    const basis=historicalPrices.length>=14?historicalPrices:livePrices;
    const sorted=[...basis].sort((a,b)=>a-b);
    const current=Number(card.price)||livePrices.at(-1)||historicalPrices.at(-1)||null;
    const med=quantile(sorted,.5),q25=quantile(sorted,.25),q10=quantile(sorted,.10),mean=avg(basis);
    const fairBuy=med?Math.min(med*.96,q25||med):current;
    const strongBuy=q10?Math.min(q10,fairBuy*.94):fairBuy?fairBuy*.94:current;
    const below=sorted.filter(x=>x<=current).length;
    const percentile=sorted.length?Math.round((below/sorted.length)*100):null;

    const historicalConfidence=clamp(Math.round(historicalPrices.length/90*95),0,95);
    const liveConfidence=clamp(Math.round(livePrices.length/24*95),5,95);
    const edge=fairBuy&&current?Math.max(0,pct(fairBuy,current)):0;
    const modelConfidence=Number(card.confidence)||50;
    const buyConfidence=clamp(Math.round(modelConfidence*.30+historicalConfidence*.35+liveConfidence*.20+Math.min(15,edge*1.5)),20,97);

    const liveTrend=trend(livePrices.length?livePrices:historicalPrices.slice(-7));
    let decision='WAIT';
    if(current&&strongBuy&&current<=strongBuy&&buyConfidence>=70)decision='BUY';
    else if(current&&fairBuy&&current<=fairBuy&&buyConfidence>=60)decision='BUY';
    else if(card.action==='PASS'||liveTrend==='Overheated')decision='PASS';

    const daily30=historicalPrices.slice(-30),daily90=historicalPrices.slice(-90),range24=livePrices.slice(-24);
    return json({
      ok:true,
      card,
      intelligence:{
        current,mean,median:med,fair_buy:fairBuy,strong_buy:strongBuy,percentile,trend:liveTrend,decision,buy_confidence:buyConfidence,
        historical_confidence:historicalConfidence,live_confidence:liveConfidence,
        historical_points:historicalPrices.length,live_points:livePrices.length,history_points:all.length,
        avg24:avg(range24),low24:range24.length?Math.min(...range24):null,high24:range24.length?Math.max(...range24):null,
        avg30:avg(daily30),low30:daily30.length?Math.min(...daily30):null,high30:daily30.length?Math.max(...daily30):null,
        avg90:avg(daily90),low90:daily90.length?Math.min(...daily90):null,high90:daily90.length?Math.max(...daily90):null,
        history_source:hist?.meta||null
      },
      history:all
    });
  }catch(e){return json({ok:false,error:e.message||'Intelligence lookup failed'},500)}
};
