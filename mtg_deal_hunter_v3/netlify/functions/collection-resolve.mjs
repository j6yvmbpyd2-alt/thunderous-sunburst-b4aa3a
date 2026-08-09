import { json } from './_shared.mjs';

const UA={'user-agent':'MTGDealHunter/4.4 collection-tracker','accept':'application/json'};

function priceFor(card,finish){
  const p=card?.prices||{};
  if(finish==='foil')return Number(p.usd_foil)||null;
  if(finish==='etched')return Number(p.usd_etched)||null;
  return Number(p.usd)||Number(p.usd_foil)||Number(p.usd_etched)||null;
}

export default async req=>{
  if(req.method!=='POST')return json({ok:false,error:'POST required'},405);
  try{
    const body=await req.json(),items=Array.isArray(body?.items)?body.items:[];
    if(!items.length)return json({ok:false,error:'No collection rows supplied'},400);
    if(items.length>3000)return json({ok:false,error:'Import is limited to 3,000 rows at a time'},400);
    const out=[];
    for(let start=0;start<items.length;start+=75){
      const batch=items.slice(start,start+75);
      const identifiers=batch.map(x=>x.id?{id:x.id}:x.set&&x.collector?{set:String(x.set).toLowerCase(),collector_number:String(x.collector)}:x.name&&x.set?{name:x.name,set:String(x.set).toLowerCase()}:{name:x.name});
      const r=await fetch('https://api.scryfall.com/cards/collection',{method:'POST',headers:{...UA,'content-type':'application/json'},body:JSON.stringify({identifiers})});
      if(!r.ok)throw Error(`Scryfall collection lookup returned ${r.status}`);
      const d=await r.json(),found=Array.isArray(d.data)?d.data:[],notFound=Array.isArray(d.not_found)?d.not_found:[];
      const byId=new Map(found.map(c=>[c.id,c]));
      const unused=[...found];
      for(let i=0;i<batch.length;i++){
        const src=batch[i];let card=null;
        if(src.id&&byId.has(src.id))card=byId.get(src.id);
        if(!card&&src.set&&src.collector)card=unused.find(c=>String(c.set).toLowerCase()===String(src.set).toLowerCase()&&String(c.collector_number)===String(src.collector));
        if(!card&&src.name)card=unused.find(c=>String(c.name).toLowerCase()===String(src.name).toLowerCase()&&(!src.set||String(c.set).toLowerCase()===String(src.set).toLowerCase()));
        if(card){
          const price=priceFor(card,src.finish);
          out.push({...src,matched:true,id:card.id,name:card.name,set:card.set,set_name:card.set_name,collector:card.collector_number,image:card.image_uris?.small||card.card_faces?.[0]?.image_uris?.small||null,scryfall_uri:card.scryfall_uri,current:price});
          const at=unused.indexOf(card);if(at>=0)unused.splice(at,1);
        }else out.push({...src,matched:false,current:null});
      }
      if(start+75<items.length)await new Promise(r=>setTimeout(r,120));
    }
    return json({ok:true,items:out,matched:out.filter(x=>x.matched).length,unmatched:out.filter(x=>!x.matched).length});
  }catch(e){return json({ok:false,error:e.message||'Collection lookup failed'},500)}
};
