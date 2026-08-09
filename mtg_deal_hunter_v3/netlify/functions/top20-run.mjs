import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const PRICE_MIN=2, PRICE_MAX=80, HISTORY_POINTS=168;

function usd(card){
  const p=Number(card?.prices?.usd);
  return p>0?p:null;
}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pct(a,b){return a>0&&b>0?((a-b)/b)*100:0}

export default async () => {
  try{
    const q=`game:paper usd>=${PRICE_MIN} usd<=${PRICE_MAX} -is:reserved`;
    const url=`https://api.scryfall.com/cards/search?unique=cards&order=edhrec&dir=asc&q=${encodeURIComponent(q)}`;
    const r=await fetch(url,{headers:{"user-agent":"MTGDealHunter/3.6","accept":"application/json"}});
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
      const a24=avg(recent.slice(-24));
      const a72=avg(recent.slice(-72));
      const drop24=a24?pct(price,a24):0;
      const drop72=a72?pct(price,a72):0;
      const popularity=Math.max(0,35-(index/120)*35);
      const dropScore=Math.max(0,-drop24)*4+Math.max(0,-drop72)*2;
      const sweetSpot=price>=4&&price<=35?8:3;
      const premiumRisk=(card.reprint||card.promo)?2:0;
      const score=Math.round((popularity+dropScore+sweetSpot-premiumRisk)*10)/10;
      const reasons=[];
      if(drop24<=-3) reasons.push(`${Math.abs(drop24).toFixed(1)}% below 24h average`);
      if(drop72<=-5) reasons.push(`${Math.abs(drop72).toFixed(1)}% below 72h average`);
      if(index<30) reasons.push("high Commander demand");
      if(!reasons.length) reasons.push("high-liquidity staple watch");
      history[card.id]=[...points,{t:now,price}].slice(-HISTORY_POINTS);
      return {id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector_number:card.collector_number,price,score,rank_source:index+1,drop24,drop72,reason:reasons.join(" • "),image:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||null,scryfall_uri:card.scryfall_uri};
    }).sort((a,b)=>b.score-a.score);

    const top20=ranked.slice(0,20).map((x,i)=>({...x,rank:i+1}));
    const oldIds=new Set(oldTop.map(x=>x.id));
    const entrants=top20.filter(x=>!oldIds.has(x.id));
    const payload={ok:true,updated_at:new Date().toISOString(),top20,history,candidate_count:candidates.length};
    await s.setJSON("top20-tracker",payload);

    if(oldTop.length&&entrants.length){
      const lead=entrants[0];
      await sendPush({title:"MTG Watch Tracker",body:`${lead.name} entered the Top 20 at #${lead.rank} — ${lead.reason}`,url:"/?tab=tracker",tag:"top20-entry"}).catch(()=>{});
    }
    return json({...payload,history:undefined,entrants:entrants.map(x=>x.name)});
  }catch(e){
    return json({ok:false,error:e.message||"Top 20 scan failed"},500);
  }
};
