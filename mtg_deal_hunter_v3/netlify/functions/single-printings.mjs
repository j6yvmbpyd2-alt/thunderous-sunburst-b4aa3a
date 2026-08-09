import { json } from './_shared.mjs';

function normalizeCategory(v){const x=String(v||'any').toLowerCase().trim();return x==='boarderless'?'borderless':x==='boarderless-secret-lair'?'borderless-secret-lair':x}
function imageFor(card){return card.image_uris?.normal||card.card_faces?.[0]?.image_uris?.normal||null}
function priceFor(card,finish){const p=card.prices||{};if(finish==='foil')return Number(p.usd_foil)||null;if(finish==='etched')return Number(p.usd_etched)||null;return Number(p.usd)||null}
function isBorderless(card){return card.border_color==='borderless'||(card.frame_effects||[]).includes('extendedart')||(card.promo_types||[]).includes('boosterfun')&&card.full_art===true}
function treatments(card){const a=[];if(isBorderless(card))a.push('borderless');for(const x of card.frame_effects||[])a.push(x);for(const x of card.promo_types||[])a.push(x);if(card.set==='sld')a.push('Secret Lair');return [...new Set(a)]}

export default async req=>{try{
  const u=new URL(req.url),name=(u.searchParams.get('name')||'').trim(),category=normalizeCategory(u.searchParams.get('category')),finish=(u.searchParams.get('finish')||'any').toLowerCase();
  if(!name)return json({ok:false,error:'Missing card name'},400);
  const safe=name.replaceAll('"','');
  const terms=[`!\"${safe}\"`];
  if(category==='borderless')terms.push('is:borderless');
  if(category==='secret-lair')terms.push('set:sld');
  if(category==='borderless-secret-lair')terms.push('set:sld','is:borderless');
  if(finish==='foil')terms.push('is:foil');
  if(finish==='nonfoil')terms.push('is:nonfoil');
  if(finish==='etched')terms.push('is:etched');
  let next=`https://api.scryfall.com/cards/search?unique=prints&order=released&dir=desc&q=${encodeURIComponent(terms.join(' '))}`,cards=[];
  for(let page=0;page<6&&next;page++){
    const r=await fetch(next,{headers:{'user-agent':'MTGDealHunter/4.8','accept':'application/json'}});
    if(!r.ok){const e=await r.json().catch(()=>({}));return json({ok:false,error:e.details||'No matching printings found'},404)}
    const d=await r.json();cards.push(...(d.data||[]));next=d.has_more?d.next_page:null;
  }
  const results=[];
  for(const c of cards){
    const finishes=finish==='any'?['nonfoil','foil','etched'].filter(f=>f==='nonfoil'?c.nonfoil:f==='foil'?c.foil:(c.finishes||[]).includes('etched')):[finish];
    for(const f of finishes){
      const supported=f==='nonfoil'?c.nonfoil:f==='foil'?c.foil:(c.finishes||[]).includes('etched');if(!supported)continue;
      results.push({id:c.id,name:c.name,set:c.set,set_name:c.set_name,collector_number:c.collector_number,released_at:c.released_at,rarity:c.rarity,finish:f,price:priceFor(c,f),image:imageFor(c),scryfall_uri:c.scryfall_uri,treatments:treatments(c),borderless:isBorderless(c),secret_lair:c.set==='sld'});
    }
  }
  results.sort((a,b)=>String(b.released_at||'').localeCompare(String(a.released_at||''))||a.set_name.localeCompare(b.set_name)||String(a.collector_number).localeCompare(String(b.collector_number)));
  return json({ok:true,name,category,finish,count:results.length,results:results.slice(0,160)});
}catch(e){return json({ok:false,error:e.message||'Printing search failed'},500)}};