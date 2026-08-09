import { json, store } from './_shared.mjs';

const avg=a=>a.length?a.reduce((s,x)=>s+x,0)/a.length:null;
const pct=(a,b)=>a>0&&b>0?((a-b)/b)*100:0;
const clamp=(n,min,max)=>Math.max(min,Math.min(max,n));
function quantile(s,q){if(!s.length)return null;const p=(s.length-1)*q,l=Math.floor(p),h=Math.ceil(p);return l===h?s[l]:s[l]+(s[h]-s[l])*(p-l)}
const median=a=>quantile([...a].sort((x,y)=>x-y),.5);
const slope=(a,n)=>{const x=a.slice(-n);return x.length<2?0:pct(x.at(-1),x[0])};
function grade(s){return s>=90?'A':s>=80?'B':s>=68?'C':s>=55?'D':'F'}

async function baseDecision(req){
  const u=new URL(req.url),target=new URL('/.netlify/functions/card-intelligence',u.origin);target.search=u.search;
  const r=await fetch(target,{cache:'no-store',headers:{'user-agent':'MTGDealHunter/5.2 learned-wrapper'}});
  const d=await r.json().catch(()=>({}));
  return {r,d};
}
function chooseLearned(cards,id,finish,current){
  if(finish!=='any')return {key:id+'|'+finish,rec:cards?.[id+'|'+finish]||null};
  const candidates=['nonfoil','foil','etched'].map(f=>({key:id+'|'+f,finish:f,rec:cards?.[id+'|'+f]})).filter(x=>x.rec);
  if(!candidates.length)return {key:id+'|nonfoil',rec:null};
  candidates.sort((a,b)=>{
    const ap=Number(a.rec?.last_price||0),bp=Number(b.rec?.last_price||0),ad=current&&ap?Math.abs(ap-current):999999,bd=current&&bp?Math.abs(bp-current):999999;
    if(ad!==bd)return ad-bd;
    return (b.rec?.daily?.length||0)-(a.rec?.daily?.length||0);
  });
  return candidates[0];
}
function recomputeSizing(decision,confidence,dataQuality,liquidity,reprintRisk,current){
  let position=decision!=='BUY'?{min:0,max:0,label:'No new position'}:confidence>=85&&dataQuality>=85?{min:25,max:40,label:'Strong evidence'}:confidence>=70&&dataQuality>=75?{min:15,max:25,label:'Moderate position'}:{min:5,max:15,label:'Speculative position'};
  if(decision==='BUY'&&liquidity==='MEDIUM')position={min:Math.min(position.min,15),max:Math.min(position.max,25),label:'Reduced for medium liquidity'};
  if(decision==='BUY'&&liquidity==='LOW')position={min:Math.min(position.min,5),max:Math.min(position.max,15),label:'Reduced for low liquidity'};
  if(decision==='BUY'&&reprintRisk==='MEDIUM')position={min:Math.min(position.min,10),max:Math.min(position.max,20),label:'Reduced for reprint risk'};
  if(decision==='BUY'&&reprintRisk==='HIGH')position={min:Math.min(position.min,5),max:Math.min(position.max,10),label:'Small position due to high reprint risk'};
  let suggestedPurchase=0,suggestedBuys={min:0,max:0,target:0,label:'No buy'};
  if(decision==='BUY'&&current>0&&position.max>0){let cap=liquidity==='HIGH'?8:liquidity==='MEDIUM'?6:4;if(reprintRisk==='HIGH')cap=Math.min(cap,3);else if(reprintRisk==='MEDIUM')cap=Math.min(cap,5);const minCopies=Math.max(1,Math.min(cap,Math.ceil(position.min/current))),maxCopies=Math.max(minCopies,Math.min(cap,Math.floor(position.max/current)||1)),target=Math.max(minCopies,Math.min(maxCopies,Math.round(((position.min+position.max)/2)/current)));suggestedPurchase=+(target*current).toFixed(2);suggestedBuys={min:minCopies,max:maxCopies,target,label:minCopies===maxCopies?`${minCopies} cop${minCopies===1?'y':'ies'}`:`${minCopies}–${maxCopies} copies`};}
  return {position,suggestedPurchase,suggestedBuys};
}

export default async req=>{
  try{
    const u=new URL(req.url),id=u.searchParams.get('id'),finish=(u.searchParams.get('finish')||'any').toLowerCase();
    if(!id)return json({ok:false,error:'Missing card id'},400);
    const {r,d}=await baseDecision(req);
    if(!r.ok||!d.ok)return json(d,r.status||500);
    const base=d.intelligence||{};
    if(Number(base.historical_points||0)>=30)return json({...d,intelligence:{...base,learned_history_used:false}});

    const learned=(await store().get('searched-price-history',{type:'json',consistency:'strong'}).catch(()=>null))||{cards:{}};
    const chosen=chooseLearned(learned.cards,id,finish,Number(base.current||0)),key=chosen.key,rec=chosen.rec;
    const daily=(rec?.daily||[]).map(x=>({t:Date.parse(x.date+'T12:00:00Z'),price:Number(x.price),source:'learned daily'})).filter(x=>x.t&&x.price>0);
    const hourly=(rec?.hourly||[]).map(x=>({t:Number(x.t),price:Number(x.price),source:'learned hourly'})).filter(x=>x.t&&x.price>0);
    const hp=daily.map(x=>x.price);
    if(hp.length<7)return json({...d,intelligence:{...base,learned_history_used:false,learned_history_points:hp.length,learned_history_status:'building',learned_history_finish:key.split('|').at(-1)}});

    const d30=hp.slice(-30),d90=hp.slice(-90),d14=hp.slice(-14),prior=hp.slice(-74,-14),sorted=[...d90].sort((a,b)=>a-b),m30=median(d30),m90=median(d90),m14=median(d14),mp=median(prior),q10=quantile(sorted,.1),q25=quantile(sorted,.25),q75=quantile(sorted,.75),iqr=q25!=null&&q75!=null?q75-q25:null,outlier=iqr>0?d90.filter(x=>x<q25-1.5*iqr||x>q75+1.5*iqr).length/Math.max(1,d90.length):0,regimeDelta=m14&&mp?pct(m14,mp):0,regime=hp.length>=30&&Math.abs(regimeDelta)>=35,baseline=hp.length<14?45:regime?45:outlier>.25?55:outlier>.15?70:88;
    const s7=slope(hp,7),s14=slope(hp,14),s30=slope(hp,30),last7=hp.slice(-7),range7=last7.length?100*(Math.max(...last7)-Math.min(...last7))/Math.max(.01,avg(last7)):99,stabilized=last7.length>=7&&range7<=4&&s7>=-2,reversing=hp.length>=8&&s7>1&&s14<=0,fallingKnife=(s14<=-5&&s7<-1)||(s30<=-10&&s14<-2),bottomConfirmed=stabilized||reversing;
    const historicalCurrent=hp.at(-1)||base.historical_current||base.current,current=Number(base.current)||historicalCurrent,fair=m30?Math.min(m30*.96,q25||m30):historicalCurrent,strong=q10?Math.min(q10,fair*.94):fair,rawMax=strong||fair||base.raw_max_buy||base.max_buy||current,reprintFactor=base.reprint_risk==='HIGH'?.92:base.reprint_risk==='MEDIUM'?.96:1,maxBuy=rawMax?rawMax*reprintFactor:rawMax,percentile=sorted.length&&historicalCurrent?Math.round(sorted.filter(x=>x<=historicalCurrent).length/sorted.length*100):null;
    const hc=clamp(Math.round(hp.length/90*95),8,95),lc=clamp(Math.round(hourly.length/24*95),5,95),gap=current&&historicalCurrent?Math.abs(pct(current,historicalCurrent)):null,consistency=gap==null?45:gap<=8?95:gap<=15?85:gap<=25?70:gap<=40?55:35;
    let confidence=Number(base.buy_confidence||50);confidence=clamp(Math.round(confidence*.45+hc*.20+lc*.10+consistency*.10+baseline*.15),20,89);if(hp.length<14)confidence=Math.min(confidence,58);if(fallingKnife&&!bottomConfirmed)confidence=Math.min(confidence,59);if(regime)confidence=Math.min(confidence,62);if(base.reprint_risk==='HIGH')confidence=Math.min(confidence,69);if(base.reprint_risk==='MEDIUM')confidence=Math.min(confidence,79);
    const priceGate=current!=null&&maxBuy!=null&&current<=maxBuy,eligible=hp.length>=14&&confidence>=60&&consistency>=65&&baseline>=65&&!regime&&priceGate&&!fallingKnife&&bottomConfirmed;
    let decision='WAIT';if(eligible&&(historicalCurrent<=fair||historicalCurrent<=strong))decision='BUY';else if(base.decision==='PASS')decision='PASS';
    let trigger='WAIT for learned history to mature.';if(!priceGate)trigger=`WAIT until price is at or below ${Number(maxBuy||0).toLocaleString(undefined,{style:'currency',currency:'USD'})}.`;else if(fallingKnife&&!bottomConfirmed)trigger='WAIT for bottom confirmation in the learned price history.';else if(!bottomConfirmed)trigger='WAIT for at least 7 days of stabilization or a confirmed short-term reversal.';else if(decision==='BUY')trigger=`Learned-history entry conditions confirmed at or below ${Number(maxBuy).toLocaleString(undefined,{style:'currency',currency:'USD'})}.`;
    const dataQualityScore=clamp(Math.round(hc*.30+lc*.15+consistency*.25+baseline*.30),0,94),sizing=recomputeSizing(decision,confidence,dataQualityScore,base.liquidity,base.reprint_risk,current),why=[...(base.why||[])],risks=[...(base.risks||[])];why.push(`App-learned exact-print history is contributing ${hp.length} daily and ${hourly.length} hourly observations for ${key.split('|').at(-1)}.`);if(percentile!=null&&percentile<=20)why.push(`Learned history places the card in the bottom ${percentile}% of its tracked range.`);if(fallingKnife)risks.unshift(`Learned-history falling-knife warning: 7d ${s7.toFixed(1)}%, 14d ${s14.toFixed(1)}%, 30d ${s30.toFixed(1)}%.`);if(hp.length<30)risks.push('Learned history is still maturing, so long-range confidence remains limited.');
    const learnedSeries=[...daily,...hourly].sort((a,b)=>a.t-b.t);
    return json({...d,intelligence:{...base,historical_current:historicalCurrent,median30:m30,median90:m90,fair_buy:fair,strong_buy:strong,raw_max_buy:rawMax,max_buy:maxBuy,percentile,decision,buy_confidence:confidence,data_quality_score:dataQualityScore,evidence_score:dataQualityScore,data_quality_grade:grade(dataQualityScore),evidence_grade:grade(dataQualityScore),pricing_consistency:consistency,baseline_quality:baseline,entry_trigger:trigger,falling_knife:fallingKnife,bottom_confirmed:bottomConfirmed,stabilized,reversing,slope7:+s7.toFixed(2),slope14:+s14.toFixed(2),slope30:+s30.toFixed(2),range7:+range7.toFixed(2),historical_confidence:hc,live_confidence:Math.max(Number(base.live_confidence||0),lc),historical_points:hp.length,history_points:learnedSeries.length,history_source:{source:'App learned exact-print history',provider:'Scryfall snapshots',resolution:'hourly + daily',finish:key.split('|').at(-1)},learned_history_used:true,learned_history_points:hp.length,learned_history_finish:key.split('|').at(-1),position:sizing.position,suggested_purchase_amount:sizing.suggestedPurchase,suggested_buys:sizing.suggestedBuys,why,risks},history:learnedSeries});
  }catch(e){return json({ok:false,error:e.message||'Learned intelligence lookup failed'},500)}
};