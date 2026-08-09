import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const PRICE_MIN=2, PRICE_MAX=80, HISTORY_POINTS=168;
const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const pct=(a,b)=>a>0&&b>0?((a-b)/b)*100:0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
const usd=card=>{const p=Number(card?.prices?.usd);return p>0?p:null};
function quantile(sorted,q){if(!sorted.length)return null;const p=(sorted.length-1)*q,lo=Math.floor(p),hi=Math.ceil(p);return lo===hi?sorted[lo]:sorted[lo]+(sorted[hi]-sorted[lo])*(p-lo)}
function isPremium(card){const promos=Array.isArray(card?.promo_types)?card.promo_types:[];return card?.border_color==='borderless'||card?.set==='sld'||String(card?.set_name||'').toLowerCase().includes('secret lair')||promos.some(x=>['boosterfun','showcase','extendedart','buyabox'].includes(String(x).toLowerCase()))}
function isGenericStaple(card){return ['sol ring','command tower','arcane signet','cultivate','exotic orchard','lightning greaves','swords to plowshares','path to exile','counterspell'].includes(String(card?.name||'').toLowerCase())}
function verdict(score,s,historyPoints,consistency){
  const evidence=[s.value>=12,s.momentum>=3,s.demand>=8,s.premium>=8,s.penalties===0,historyPoints>=30,consistency>=80].filter(Boolean).length;
  let action='PASS';
  if(score>=48&&s.value>=10&&s.penalties<12&&consistency>=65)action='BUY'; else if(score>=28)action='WATCH';
  let confidence=clamp(Math.round(28+evidence*8+Math.min(24,s.value/2)+Math.min(10,s.momentum)-Math.min(20,s.penalties)),25,95);
  if(consistency<80)confidence=Math.min(confidence,84);
  if(consistency<65)confidence=Math.min(confidence,69);
  if(consistency<50){confidence=Math.min(confidence,54);if(action==='BUY')action='WATCH'}
  return {action,confidence};
}
async function loadHistoricalCache(){try{const origin=process.env.DEPLOY_PRIME_URL||process.env.URL;if(!origin)return {cards:{}};const r=await fetch(`${origin.replace(/\/$/,'')}/data/mtgjson-history.json`,{cache:'no-store',signal:AbortSignal.timeout(6000)});return r.ok?await r.json():{cards:{}}}catch{return {cards:{}}}}

export default async()=>{
  try{
    const q=`game:paper usd>=${PRICE_MIN} usd<=${PRICE_MAX} -is:reserved`;
    const url=`https://api.scryfall.com/cards/search?unique=cards&order=edhrec&dir=asc&q=${encodeURIComponent(q)}`;
    const [r,historical]=await Promise.all([fetch(url,{headers:{'user-agent':'MTGDealHunter/4.1','accept':'application/json'}}),loadHistoricalCache()]);
    if(!r.ok)throw new Error(`Scryfall ${r.status}`);
    const data=await r.json(),candidates=(data.data||[]).slice(0,120).filter(c=>usd(c));
    const s=store(),old=await s.get('top20-tracker',{type:'json',consistency:'strong'}).catch(()=>null),history=old?.history&&typeof old.history==='object'?old.history:{},oldTop=Array.isArray(old?.top20)?old.top20:[],now=Date.now();

    const ranked=candidates.map((card,index)=>{
      const livePrice=usd(card),points=Array.isArray(history[card.id])?history[card.id]:[],recent=points.map(x=>Number(x.price)).filter(x=>x>0),previous=recent.at(-1)||null;
      const a6=avg(recent.slice(-6)),a24=avg(recent.slice(-24)),a72=avg(recent.slice(-72));
      const move1=previous?pct(livePrice,previous):0,vs6=a6?pct(livePrice,a6):0,drop24=a24?pct(livePrice,a24):0,drop72=a72?pct(livePrice,a72):0;

      const hp=(historical?.cards?.[card.id]?.points||[]).map(x=>Number(x.price)).filter(x=>x>0),h30=hp.slice(-30),h90=hp.slice(-90),h7=hp.slice(-7);
      const histCurrent=hp.at(-1)||null,avg30=avg(h30),avg90=avg(h90),avg7=avg(h7);
      const histVs30=avg30&&histCurrent?pct(histCurrent,avg30):0,histVs90=avg90&&histCurrent?pct(histCurrent,avg90):0,histTrend=avg7&&avg30?pct(avg7,avg30):0;
      const sorted90=[...h90].sort((a,b)=>a-b),percentile90=sorted90.length&&histCurrent?Math.round((sorted90.filter(x=>x<=histCurrent).length/sorted90.length)*100):null,q25=quantile(sorted90,.25),belowQ25=q25&&histCurrent<q25?pct(histCurrent,q25):0;

      // Compare live Scryfall and latest MTGJSON only as a consistency test, never as a historical discount calculation.
      const sourceGap=histCurrent?Math.abs(pct(livePrice,histCurrent)):null;
      const consistency=sourceGap==null?45:sourceGap<=8?95:sourceGap<=15?85:sourceGap<=25?70:sourceGap<=40?55:35;
      const histWeight=consistency>=80?1:consistency>=65?.7:consistency>=50?.4:.15;

      const demandScore=clamp(12-(index/120)*10,2,12);
      const liveValue=Math.max(0,-drop24)*4+Math.max(0,-drop72)*2+Math.max(0,-vs6)*1.5;
      const rawHistValue=Math.max(0,-histVs30)*2.2+Math.max(0,-histVs90)*1.2+Math.max(0,-belowQ25)*1.2+(percentile90!==null&&percentile90<=20?7:percentile90!==null&&percentile90<=35?3:0);
      const valueScore=clamp(liveValue+rawHistValue*histWeight,0,60);
      const momentumScore=clamp(Math.max(0,move1)*3+(histTrend>1?Math.min(8,histTrend*1.2)*histWeight:0),0,16);
      let entryScore=livePrice>=4&&livePrice<=25?10:livePrice>25&&livePrice<=45?6:livePrice>=2&&livePrice<4?4:1;
      const premium=isPremium(card),premiumScore=premium?8:0,supplyRisk=(card.reprint&&!premium?5:0)+(card.digital?4:0),noLiveEdge=drop24>-2&&drop72>-3&&vs6>-1.5&&move1<1,noHistoricalEdge=histVs30>-3&&histVs90>-5&&(percentile90===null||percentile90>40),noEdge=noLiveEdge&&noHistoricalEdge;
      const genericPenalty=isGenericStaple(card)&&noEdge?18:0,chasePenalty=move1>=8&&histVs30>-5?12:move1>=4&&histVs30>-3?6:0,historicalChasePenalty=histVs30>=12&&histTrend>=5?8:0,consistencyPenalty=consistency<50?14:consistency<65?8:consistency<80?3:0;
      const penalties=supplyRisk+genericPenalty+chasePenalty+historicalChasePenalty+consistencyPenalty;
      const score=Math.round((valueScore+momentumScore+entryScore+premiumScore+demandScore-penalties)*10)/10;
      const reasons=[];
      if(drop24<=-3)reasons.push(`${Math.abs(drop24).toFixed(1)}% below live 24h average`);
      if(histVs30<=-5)reasons.push(`${Math.abs(histVs30).toFixed(1)}% below MTGJSON 30d average`);
      if(histVs90<=-8)reasons.push(`${Math.abs(histVs90).toFixed(1)}% below MTGJSON 90d average`);
      if(percentile90!==null&&percentile90<=20)reasons.push(`bottom ${percentile90}% of 90d historical prices`);
      if(sourceGap!=null&&sourceGap>15)reasons.push(`price sources differ ${sourceGap.toFixed(1)}% — confidence reduced`);
      if(move1>=1&&move1<8)reasons.push(`turning up ${move1.toFixed(1)}% since last check`);
      if(premium)reasons.push(card.set==='sld'||String(card.set_name||'').toLowerCase().includes('secret lair')?'premium Secret Lair printing':'premium treatment');
      if(index<30)reasons.push('strong Commander demand');
      if(!reasons.length)reasons.push(hp.length?'historical price is near normal range':'building historical signal');
      const signal={value:+valueScore.toFixed(1),momentum:+momentumScore.toFixed(1),demand:+demandScore.toFixed(1),entry:entryScore,premium:premiumScore,penalties,historical_points:hp.length,hist_vs_30:+histVs30.toFixed(2),hist_vs_90:+histVs90.toFixed(2),percentile_90:percentile90,hist_trend:+histTrend.toFixed(2),historical_current:histCurrent,source_gap_pct:sourceGap==null?null:+sourceGap.toFixed(2),pricing_consistency:consistency};
      const recommendation=verdict(score,signal,hp.length,consistency);
      history[card.id]=[...points,{t:now,price:livePrice}].slice(-HISTORY_POINTS);
      return {id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector_number:card.collector_number,price:livePrice,score,rank_source:index+1,drop24,drop72,move1,vs6,premium,hist_vs_30:histVs30,hist_vs_90:histVs90,percentile_90:percentile90,historical_points:hp.length,historical_current:histCurrent,pricing_consistency:consistency,source_gap_pct:sourceGap,action:recommendation.action,confidence:recommendation.confidence,reason:reasons.join(' • '),image:card.image_uris?.normal||card.card_faces?.[0]?.image_uris?.normal||card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||null,scryfall_uri:card.scryfall_uri,signal};
    }).sort((a,b)=>b.score-a.score);

    const top20=ranked.slice(0,20).map((x,i)=>({...x,rank:i+1})),oldIds=new Set(oldTop.map(x=>x.id)),entrants=top20.filter(x=>!oldIds.has(x.id));
    const payload={ok:true,model:'opportunity-v5-calibrated',updated_at:new Date().toISOString(),top20,history,candidate_count:candidates.length,historical_matches:Object.keys(historical?.cards||{}).length};
    await s.setJSON('top20-tracker',payload);
    if(oldTop.length&&entrants.length){const lead=entrants[0];await sendPush({title:'MTG Watch Tracker',body:`${lead.action}: ${lead.name} entered #${lead.rank} (${lead.confidence}% confidence)`,url:'/?tab=tracker',tag:'top20-entry'}).catch(()=>{})}
    return json({...payload,history:undefined,entrants:entrants.map(x=>x.name)});
  }catch(e){return json({ok:false,error:e.message||'Top 20 scan failed'},500)}
};
