import { json, referencePriceForCard } from "./_shared.mjs";

function wantedFinish(card, finish){
  const f=String(finish||"any").toLowerCase();
  if(f==="foil") return Boolean(card.foil);
  if(f==="etched") return Array.isArray(card.finishes) && card.finishes.includes("etched");
  if(f==="nonfoil") return Boolean(card.nonfoil);
  return true;
}

function imageFor(card){
  return card.image_uris?.normal || card.card_faces?.[0]?.image_uris?.normal || null;
}

export default async (req) => {
  try{
    const url=new URL(req.url);
    const name=(url.searchParams.get("name")||"").trim();
    const finish=(url.searchParams.get("finish")||"any").toLowerCase();
    const category=(url.searchParams.get("category")||"any").toLowerCase();
    if(!name) return json({ok:false,error:"Missing card name"},400);

    const safeName=name.replaceAll('"','');
    const terms=[`name:\"${safeName}\"`];
    if(category==="borderless") terms.push("is:borderless");
    if(category==="secret-lair") terms.push("set:sld");
    if(category==="borderless-secret-lair") terms.push("set:sld","is:borderless");

    const search=`https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=${encodeURIComponent(terms.join(" "))}`;
    const r=await fetch(search,{headers:{"user-agent":"MTGDealHunter/3.5","accept":"application/json"}});
    if(!r.ok){
      const e=await r.json().catch(()=>({}));
      return json({ok:false,error:e.details||"No matching printing found"},404);
    }
    const data=await r.json();
    const cards=(data.data||[]).filter(c=>wantedFinish(c,finish));
    if(!cards.length) return json({ok:false,error:"No matching printing found for that finish/category"},404);

    const card=cards[0];
    let resolvedFinish=finish;
    if(resolvedFinish==="any") resolvedFinish=card.nonfoil?"nonfoil":(card.foil?"foil":(card.finishes?.[0]||"nonfoil"));
    const ref=await referencePriceForCard(card,resolvedFinish);

    return json({
      ok:true,
      card:{
        id:card.id,
        name:card.name,
        set:card.set,
        set_name:card.set_name,
        collector_number:card.collector_number,
        rarity:card.rarity,
        foil:Boolean(card.foil),
        nonfoil:Boolean(card.nonfoil),
        finishes:card.finishes||[],
        frame_effects:card.frame_effects||[],
        promo_types:card.promo_types||[],
        image:imageFor(card),
        scryfall_uri:card.scryfall_uri,
        tcgplayer_id:card.tcgplayer_id||null
      },
      category,
      finish:resolvedFinish,
      reference_price:ref.price,
      price_source:ref.source
    });
  }catch(e){
    return json({ok:false,error:e.message||"Lookup failed"},500);
  }
};
