import { getStore } from "@netlify/blobs";

export const store = () => getStore({ name: "mtg-deal-hunter", consistency: "strong" });
export const json = (body, status=200) => new Response(JSON.stringify(body), {status, headers:{"content-type":"application/json; charset=utf-8","cache-control":"no-store"}});
export const keyFor = d => [d.type||"deal",d.store||"",d.name||"",d.url||""].join("|").toLowerCase();
export const clean = v => typeof v === "string" ? v.trim() : v;

let tcgToken=null;
let tcgTokenExpires=0;

async function getTcgToken(){
  const publicKey=process.env.TCGPLAYER_PUBLIC_KEY;
  const privateKey=process.env.TCGPLAYER_PRIVATE_KEY;
  if(!publicKey||!privateKey) return null;
  if(tcgToken&&Date.now()<tcgTokenExpires-60000) return tcgToken;
  const body=new URLSearchParams({grant_type:"client_credentials",client_id:publicKey,client_secret:privateKey});
  const r=await fetch("https://api.tcgplayer.com/token",{
    method:"POST",
    headers:{"content-type":"application/x-www-form-urlencoded","accept":"application/json"},
    body
  });
  if(!r.ok) return null;
  const data=await r.json();
  if(!data.access_token) return null;
  tcgToken=data.access_token;
  tcgTokenExpires=Date.now()+(Number(data.expires_in||3600)*1000);
  return tcgToken;
}

export async function tcgMarketPrice(card, finish="nonfoil"){
  const token=await getTcgToken();
  if(!token) return null;
  const f=String(finish||"nonfoil").toLowerCase();
  const productId=f==="etched"?(card.tcgplayer_etched_id||card.tcgplayer_id):card.tcgplayer_id;
  if(!productId) return null;
  const r=await fetch(`https://api.tcgplayer.com/pricing/product/${encodeURIComponent(productId)}`,{
    headers:{"authorization":`bearer ${token}`,"accept":"application/json"}
  });
  if(!r.ok) return null;
  const data=await r.json();
  const rows=Array.isArray(data.results)?data.results:[];
  let row=null;
  if(f==="foil") row=rows.find(x=>/foil/i.test(String(x.subTypeName||""))&&!/reverse/i.test(String(x.subTypeName||"")));
  else if(f==="nonfoil") row=rows.find(x=>/^normal$/i.test(String(x.subTypeName||"")))||rows.find(x=>!/foil/i.test(String(x.subTypeName||"")));
  else row=rows.find(x=>Number(x.marketPrice)>0);
  const p=Number(row?.marketPrice);
  return p>0?p:null;
}

function scryfallUsd(card, finish="nonfoil"){
  const p=card.prices||{},f=String(finish||"nonfoil").toLowerCase();
  if(f==="foil") return p.usd_foil?Number(p.usd_foil):null;
  if(f==="etched") return p.usd_etched?Number(p.usd_etched):null;
  return p.usd?Number(p.usd):null;
}

export async function referencePriceForCard(card, finish="nonfoil"){
  try{
    const tcg=await tcgMarketPrice(card,finish);
    if(tcg>0) return {price:tcg,source:"TCGplayer Market"};
  }catch{}
  const fallback=scryfallUsd(card,finish);
  return {price:fallback,source:"Scryfall USD fallback"};
}

export async function exactScryfallPrice(item){
  if(item.market_price) return Number(item.market_price);
  if(item.type !== "single") return null;
  let url;
  if(item.set && item.collector_number) url=`https://api.scryfall.com/cards/${encodeURIComponent(String(item.set).toLowerCase())}/${encodeURIComponent(item.collector_number)}`;
  else if(item.card_name) url=`https://api.scryfall.com/cards/named?exact=${encodeURIComponent(item.card_name)}`;
  else return null;
  const r=await fetch(url,{headers:{"user-agent":"MTGDealHunter/3.3","accept":"application/json"}});
  if(!r.ok) return null;
  const c=await r.json();
  const ref=await referencePriceForCard(c,item.finish||"nonfoil");
  return ref.price;
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
