import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const PRICE_MIN=2, PRICE_MAX=80, HISTORY_POINTS=168;

function usd(card){const p=Number(card?.prices?.usd);return p>0?p:null}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pct(a,b){return a>0&&b>0?((a-b)/b)*100:0}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function quantile(sorted,q){
  if(!sorted.length)return null;
  const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);
  if(lo===hi)return sorted[lo];
  return sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo);
}
function isPremium(card){
  const promos=Array.isArray(card?.promo_types)?card.promo_types:[];
  return card?.border_color==='borderless'||card?.set==='sld'||String(card?.set_name||'').toLowerCase().includes('secret lair')||promos.some(x=>['boosterfun','showcase','extendedart','buyabox'].includes(String(x).toLowerCase()));
}
function isGenericStaple(card){
  const n=String(card?.name||'').toLowerCase();
  return ['sol ring','command tower','arcane signet','cultivate','exotic orchard','lightning greaves','swords to plowshares','path to exile','counterspell'].includes(n);
}
function verdict(score,signals,historyPoints){
  const evidence=[signals.value>=12,signals.momentum>=3,signals.demand>=8,signals.premium>=8,signals.penalties===0,historyPoints>=30].filter(Boolean).length;
  let action='PASS';
  if(score>=48&&signals.value>=10&&signals.penalties<12) action='BUY';
  else if(score>=28) action='WATCH';
  const historyBoost=historyPoints>=60?8:historyPoints>=30?5:0;
  const confidence=clamp(Math.round(30+evidence*9+Math.min(25,signals.value/2)+Math.min(10,signals.momentum)+historyBoost-Math.min(20,signals.penalties)),25,95);
  return {action,confidence,evidence};
}
async function loadHistoricalCache(){
  try{
    const origin=process.env.DEPLOY_PRIME_URL||process.env.URL;
    if(!origin)return {cards:{}};
    const r=await fetch(`${origin.replace(/\/$/,'')}/data/mtgjson-history.json`,{cache:'no-store',signal:AbortSignal.timeout(6000)});
    if(!r.ok)return {cards:{}};
    return await r.json();
  }catch{return {cards:{}}}
}

export default async () => {
  try{
    const q=`game:paper usd>=${PRICE_MIN} usd<=${PRICE_MAX} -is:reserved`;
    const url=`https://api.scryfall.com/cards/search?unique=cards&order=edhrec&dir=asc&q=${encodeURIComponent(q)}`;
    const [r,historical]=await Promise.all([
      fetch(url,{headers:{"user-agent":"MTGDealHunter/4.0","accept":"application/json"}}),
      loadHistoricalCache()
    ]);
    if(!r.ok) throw new Error(`Scryfall ${r.status}`);
    const data=await r.json();
    const candidates=(data.data||[]).slice(0,120).filter(c=>usd(c));
    const s=store();
    const old=await s.get("top20-tracker",{type:"json",consistency:"strong"}).catch(()=>null);
    const history=old?.history&&typeof old.history==="object"?old.history:{};
    const oldTop=Array.isArray(old?.top20)?old.top20:[];
    const now=Date.now();

    const ranked=candidates.map((card,index)=>{
      const price=usd(card);
      const points=Array.isArray(history[card.id])?history[card.id]:[];
      const recent=points.map(x=>Number(x.price)).filter(x=>x>0);
      const previous=recent.length?recent.at(-1):null;
      const a6=avg(recent.slice(-6));
      const a24=avg(recent.slice(-24));
      const a72=avg(recent.slice(-72));
      const move1=previous?pct(price,previous):0;
      const vs6=a6?pct(price,a6):0;
      const drop24=a24?pct(price,a24):0;
      const drop72=a72?pct(price,a72):0;

      const hp=(historical?.cards?.[card.id]?.points||[]).map(x=>Number(x.price)).filter(x=>x>0);
      const h30=hp.slice(-30),h90=hp.slice(-90),h7=hp.slice(-7);
      const avg30=avg(h30),avg90=avg(h90),avg7=avg(h7);
      const histVs30=avg30?pct(price,avg30):0;
      const histVs90=avg90?pct(price,avg90):0;
      const histTrend=avg7&&avg30?pct(avg7,avg30):0;
      const sorted90=[...h90].sort((a,b)=>a-b);
      const percentile90=sorted90.length?Math.round((sorted90.filter(x=>x<=price).length/sorted90.length)*100):null;
      const q25=quantile(sorted90,.25);
      const belowQ25=q25&&price<q25?pct(price,q25):0;

      const demandScore=clamp(12-(index/120)*10,2,12);

      // Live discount signals plus historical 30/90-day positioning.
      const liveValue=Math.max(0,-drop24)*4+Math.max(0,-drop72)*2+Math.max(0,-vs6)*1.5;
      const historicalValue=Math.max(0,-histVs30)*2.4+Math.max(0,-histVs90)*1.3+Math.max(0,-belowQ25)*1.5+(percentile90!==null&&percentile90<=20?8:percentile90!==null&&percentile90<=35?4:0);
      const valueScore=clamp(liveValue+historicalValue,0,60);

      // Live reversal is strongest; historical trend adds context without overpowering current movement.
      const liveMomentum=Math.max(0,move1)*3;
      const historicalMomentum=histTrend>1?Math.min(8,histTrend*1.4):0;
      const momentumScore=clamp(liveMomentum+historicalMomentum,0,16);

      let entryScore=0;
      if(price>=4&&price<=25) entryScore=10; else if(price>25&&price<=45) entryScore=6; else if(price>=2&&price<4) entryScore=4; else entryScore=1;
      const premium=isPremium(card),premiumScore=premium?8:0;
      const supplyRisk=(card.reprint&&!premium?5:0)+(card.digital?4:0);
      const noLiveEdge=(drop24>-2&&drop72>-3&&vs6>-1.5&&move1<1);
      const noHistoricalEdge=(histVs30>-3&&histVs90>-5&&(percentile90===null||percentile90>40));
      const noEdge=noLiveEdge&&noHistoricalEdge;
      const genericPenalty=isGenericStaple(card)&&noEdge?18:0;
      const chasePenalty=(move1>=8&&histVs30>-5)?12:(move1>=4&&histVs30>-3?6:0);
      const historicalChasePenalty=histVs30>=12&&histTrend>=5?8:0;
      const penalties=supplyRisk+genericPenalty+chasePenalty+historicalChasePenalty;
      const score=Math.round((valueScore+momentumScore+entryScore+premiumScore+demandScore-penalties)*10)/10;

      const reasons=[];
      if(drop24<=-3) reasons.push(`${Math.abs(drop24).toFixed(1)}% below live 24h average`);
      if(histVs30<=-5) reasons.push(`${Math.abs(histVs30).toFixed(1)}% below 30d average`);
      if(histVs90<=-8) reasons.push(`${Math.abs(histVs90).toFixed(1)}% below 90d average`);
      if(percentile90!==null&&percentile90<=20) reasons.push(`bottom ${percentile90}% of 90d prices`);
      if(move1>=1&&move1<8) reasons.push(`turning up ${move1.toFixed(1)}% since last check`);
      if(histTrend>=2) reasons.push(`7d trend ${histTrend.toFixed(1)}% above 30d baseline`);
      if(premium) reasons.push(card.set==='sld'||String(card.set_name||'').toLowerCase().includes('secret lair')?'premium Secret Lair printing':'premium treatment');
      if(index<30) reasons.push('strong Commander demand');
      if(noEdge&&isGenericStaple(card)) reasons.push('generic staple — needs a stronger price edge');
      if(!reasons.length) reasons.push(hp.length?'historical price is near normal range':'building historical signal');

      const signal={
        value:Number(valueScore.toFixed(1)),momentum:Number(momentumScore.toFixed(1)),demand:Number(demandScore.toFixed(1)),entry:entryScore,premium:premiumScore,penalties,
        historical_points:hp.length,hist_vs_30:Number(histVs30.toFixed(2)),hist_vs_90:Number(histVs90.toFixed(2)),percentile_90:percentile90,hist_trend:Number(histTrend.toFixed(2))
      };
      const recommendation=verdict(score,signal,hp.length);
      history[card.id]=[...points,{t:now,price}].slice(-HISTORY_POINTS);
      return {
        id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector_number:card.collector_number,
        price,score,rank_source:index+1,drop24,drop72,move1,vs6,premium,
        hist_vs_30:histVs30,hist_vs_90:histVs90,percentile_90:percentile90,historical_points:hp.length,
        action:recommendation.action,confidence:recommendation.confidence,
        reason:reasons.join(' • '),
        image:card.image_uris?.normal||card.card_faces?.[0]?.image_uris?.normal||card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||null,
        scryfall_uri:card.scryfall_uri,signal
      };
    }).sort((a,b)=>b.score-a.score);

    const top20=ranked.slice(0,20).map((x,i)=>({...x,rank:i+1}));
    const oldIds=new Set(oldTop.map(x=>x.id));
    const entrants=top20.filter(x=>!oldIds.has(x.id));
    const payload={ok:true,model:'opportunity-v4-historical',updated_at:new Date().toISOString(),top20,history,candidate_count:candidates.length,historical_matches:Object.keys(historical?.cards||{}).length};
    await s.setJSON("top20-tracker",payload);
    if(oldTop.length&&entrants.length){
      const lead=entrants[0];
      await sendPush({title:"MTG Watch Tracker",body:`${lead.action}: ${lead.name} entered #${lead.rank} (${lead.confidence}% confidence)`,url:"/?tab=tracker",tag:"top20-entry"}).catch(()=>{});
    }
    return json({...payload,history:undefined,entrants:entrants.map(x=>x.name)});
  }catch(e){return json({ok:false,error:e.message||"Top 20 scan failed"},500)}
};
