import { json, store } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

const PRICE_MIN=2, PRICE_MAX=80, HISTORY_POINTS=168;

function usd(card){
  const p=Number(card?.prices?.usd);
  return p>0?p:null;
}
function avg(a){return a.length?a.reduce((s,x)=>s+x,0)/a.length:null}
function pct(a,b){return a>0&&b>0?((a-b)/b)*100:0}
function clamp(n,min,max){return Math.max(min,Math.min(max,n))}
function isPremium(card){
  const promos=Array.isArray(card?.promo_types)?card.promo_types:[];
  return card?.border_color==='borderless'||card?.set==='sld'||String(card?.set_name||'').toLowerCase().includes('secret lair')||promos.some(x=>['boosterfun','showcase','extendedart','buyabox'].includes(String(x).toLowerCase()));
}
function isGenericStaple(card){
  const n=String(card?.name||'').toLowerCase();
  return ['sol ring','command tower','arcane signet','cultivate','exotic orchard','lightning greaves','swords to plowshares','path to exile','counterspell'].includes(n);
}

export default async () => {
  try{
    const q=`game:paper usd>=${PRICE_MIN} usd<=${PRICE_MAX} -is:reserved`;
    const url=`https://api.scryfall.com/cards/search?unique=cards&order=edhrec&dir=asc&q=${encodeURIComponent(q)}`;
    const r=await fetch(url,{headers:{"user-agent":"MTGDealHunter/3.7","accept":"application/json"}});
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

      // Demand matters, but cannot carry a card into the Top 20 by itself.
      const demandScore=clamp(12-(index/120)*10,2,12);

      // The strongest signal: a high-demand card trading meaningfully below its own recent history.
      const valueScore=clamp(Math.max(0,-drop24)*5+Math.max(0,-drop72)*2.5+Math.max(0,-vs6)*2,0,55);

      // Early breakout/reversal signal after a dip. Small positive moves help; runaway spikes are penalized below.
      const momentumScore=clamp(Math.max(0,move1)*3,0,12);

      // Prefer realistic entry points; very cheap cards are harder to monetize, expensive variants tie up capital.
      let entryScore=0;
      if(price>=4&&price<=25) entryScore=10;
      else if(price>25&&price<=45) entryScore=6;
      else if(price>=2&&price<4) entryScore=4;
      else entryScore=1;

      const premium=isPremium(card);
      const premiumScore=premium?8:0;

      // Reprints/promos can add supply risk unless the printing itself is premium/collectible.
      const supplyRisk=(card.reprint&&!premium?5:0)+(card.digital?4:0);

      // A generic staple with no discount or momentum is not a buy opportunity.
      const noEdge=(drop24>-2&&drop72>-3&&vs6>-1.5&&move1<1);
      const genericPenalty=isGenericStaple(card)&&noEdge?18:0;

      // Don't chase cards already ripping upward unless they were also meaningfully depressed vs history.
      const chasePenalty=(move1>=8&&drop24>-5)?12:(move1>=4&&drop24>-3?6:0);

      const score=Math.round((valueScore+momentumScore+entryScore+premiumScore+demandScore-supplyRisk-genericPenalty-chasePenalty)*10)/10;
      const reasons=[];
      if(drop24<=-3) reasons.push(`${Math.abs(drop24).toFixed(1)}% below 24h average`);
      if(drop72<=-5) reasons.push(`${Math.abs(drop72).toFixed(1)}% below 72h average`);
      if(vs6<=-2) reasons.push(`${Math.abs(vs6).toFixed(1)}% below 6h average`);
      if(move1>=1&&move1<8) reasons.push(`turning up ${move1.toFixed(1)}% since last check`);
      if(premium) reasons.push(card.set==='sld'||String(card.set_name||'').toLowerCase().includes('secret lair')?'premium Secret Lair printing':'premium treatment');
      if(index<30) reasons.push('strong Commander demand');
      if(noEdge&&isGenericStaple(card)) reasons.push('generic staple — needs a stronger price edge');
      if(!reasons.length) reasons.push('watching for a stronger value or momentum signal');

      history[card.id]=[...points,{t:now,price}].slice(-HISTORY_POINTS);
      return {
        id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector_number:card.collector_number,
        price,score,rank_source:index+1,drop24,drop72,move1,vs6,premium,
        reason:reasons.join(' • '),image:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||null,
        scryfall_uri:card.scryfall_uri,
        signal:{value:Number(valueScore.toFixed(1)),momentum:Number(momentumScore.toFixed(1)),demand:Number(demandScore.toFixed(1)),entry:entryScore,premium:premiumScore,penalties:supplyRisk+genericPenalty+chasePenalty}
      };
    }).sort((a,b)=>b.score-a.score);

    const top20=ranked.slice(0,20).map((x,i)=>({...x,rank:i+1}));
    const oldIds=new Set(oldTop.map(x=>x.id));
    const entrants=top20.filter(x=>!oldIds.has(x.id));
    const payload={ok:true,model:'opportunity-v2',updated_at:new Date().toISOString(),top20,history,candidate_count:candidates.length};
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
