import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "mtg-deal-hunter", consistency: "strong" });
export const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const keyFor = d => [d.type||"deal",d.store||"",d.name||"",d.url||""].join("|").toLowerCase();
export const clean = v => typeof v === "string" ? v.trim() : v;

export async function exactScryfallPrice(item){
  if(item.market_price) return Number(item.market_price);
  if(item.type !== "single") return null;
  let url;
  if(item.set && item.collector_number) url=`https://api.scryfall.com/cards/${encodeURIComponent(String(item.set).toLowerCase())}/${encodeURIComponent(item.collector_number)}`;
  else if(item.card_name) url=`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}`;
  else return null;
  const r=await fetch(url,{headers:{"user-agent":"MTGDealHunter/3.0"}});
  if(!r.ok) return null;
  const c=await r.json(),p=c.prices||{},f=(item.finish||"nonfoil").toLowerCase();
  if(f==="foil") return p.usd_foil ? Number(p.usd_foil) : null;
  if(f==="etched") return p.usd_etched ? Number(p.usd_etched) : null;
  return p.usd ? Number(p.usd) : null;
}

export async function normalizeDeal(raw, threshold=25){
  const price=Number(raw.price);
  if(!(price>=0)) return null;
  const market=await exactScryfallPrice(raw);
  if(!(market>0)) return null;
  const discount=(1-price/market)*100;
  if(discount < threshold) return null;
  return {
    type: clean(raw.type||"single"), name: clean(raw.name||raw.card_name||raw.product_name||"Unnamed deal"),
    store: clean(raw.store||"Unknown store"), url: clean(raw.url||""), price, market_price:market,
    discount_pct:discount, detail: clean(raw.detail||[raw.set,raw.collector_number,raw.finish,raw.condition].filter(Boolean).join(" • ")),
    found_at:new Date().toISOString()
  };
}
