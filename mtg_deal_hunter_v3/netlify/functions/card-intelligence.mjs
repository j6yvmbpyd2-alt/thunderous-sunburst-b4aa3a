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

export default async(req)=>{
  try{
    const id=new URL(req.url).searchParams.get('id');
    if(!id)return json({ok:false,error:'Missing card id'},400);
    const data=await store().get('top20-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
    if(!data)return json({ok:false,error:'Tracker has not run yet'},404);
    const card=(data.top20||[]).find(x=>x.id===id);
    const points=Array.isArray(data.history?.[id])?data.history[id]:[];
    if(!card)return json({ok:false,error:'Card is not in the current Top 20'},404);
    const prices=points.map(x=>Number(x.price)).filter(x=>x>0);
    const sorted=[...prices].sort((a,b)=>a-b);
    const current=Number(card.price)||prices.at(-1)||null;
    const med=quantile(sorted,.5),q25=quantile(sorted,.25),q10=quantile(sorted,.10),mean=avg(prices);
    const fairBuy=med?Math.min(med*.96,q25||med):current;
    const strongBuy=q10?Math.min(q10,fairBuy*.94):fairBuy?fairBuy*.94:current;
    const below=sorted.filter(x=>x<=current).length;
    const percentile=sorted.length?Math.round((below/sorted.length)*100):null;
    const historyDepth=prices.length;
    const evidenceScore=clamp(Math.round(historyDepth/24*35),5,35);
    const edge=fairBuy&&current?Math.max(0,pct(fairBuy,current)):0;
    const modelConfidence=Number(card.confidence)||50;
    const buyConfidence=clamp(Math.round(modelConfidence*.55+evidenceScore+Math.min(20,edge*2)),20,97);
    let decision='WAIT';
    if(current&&strongBuy&&current<=strongBuy&&buyConfidence>=70)decision='BUY';
    else if(current&&fairBuy&&current<=fairBuy&&buyConfidence>=60)decision='BUY';
    else if(card.action==='PASS'||trend(prices)==='Overheated')decision='PASS';
    const range24=prices.slice(-24),range72=prices.slice(-72),range168=prices.slice(-168);
    return json({
      ok:true,
      card,
      intelligence:{
        current,mean,median:med,fair_buy:fairBuy,strong_buy:strongBuy,percentile,trend:trend(prices),decision,buy_confidence:buyConfidence,history_points:historyDepth,
        avg24:avg(range24),avg72:avg(range72),avg168:avg(range168),low24:range24.length?Math.min(...range24):null,high24:range24.length?Math.max(...range24):null
      },
      history:points.map(x=>({t:x.t,price:Number(x.price)}))
    });
  }catch(e){return json({ok:false,error:e.message||'Intelligence lookup failed'},500)}
};
