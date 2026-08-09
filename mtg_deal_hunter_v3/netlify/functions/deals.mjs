import { store, json } from "./_shared.mjs";

function proxyUrl(raw){
  try{
    const u=new URL(raw);
    if(!/^https?:$/.test(u.protocol)) return "";
    return `/.netlify/functions/open-deal?url=${encodeURIComponent(u.toString())}`;
  }catch{return "";}
}

export default async () => {
  try {
    const s=store();
    const [data,watchData]=await Promise.all([
      s.get("feed",{type:"json",consistency:"strong"}),
      s.get("price-watches",{type:"json",consistency:"strong"})
    ]);
    const feed=data||{updated_at:null,deals:[]};
    const watches=watchData?.watches||[];
    const watchHits=watches.filter(w=>w.hit&&w.price!=null&&w.target!=null).map(w=>({
      type:"price-watch",
      name:w.name,
      store:"Scryfall watch",
      source_url:w.scryfall_uri||"",
      url:proxyUrl(w.scryfall_uri||""),
      price:w.price,
      market_price:w.target,
      discount_pct:w.target>0?Math.max(0,(1-w.price/w.target)*100):0,
      detail:`TARGET HIT • ${w.set_name||w.set} #${w.collector_number} • ${w.finish} • target $${Number(w.target).toFixed(2)}`,
      found_at:w.checked_at||watchData?.updated_at||new Date().toISOString()
    }));
    const stored=(feed.deals||[]).map(d=>({
      ...d,
      source_url:d.source_url||d.url||"",
      url:proxyUrl(d.source_url||d.url||"")
    }));
    return json({
      ...feed,
      deals:[...watchHits,...stored],
      watches,
      watch_updated_at:watchData?.updated_at||null,
      watch_hits:watchHits.length
    });
  } catch (e) {
    return json({updated_at:null,deals:[],watches:[],watch_hits:0,error:e.message},200);
  }
};
