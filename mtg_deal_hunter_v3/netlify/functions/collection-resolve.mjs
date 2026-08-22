import { json } from './_shared.mjs';

const UA={'user-agent':'MTGDealHunter/4.5 collection-tracker-throttled','accept':'application/json'};
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const BATCH_SIZE=75;
const BATCH_GAP_MS=650;
let lastRequestAt=0;

function priceFor(card,finish){
  const p=card?.prices||{};
  if(finish==='foil')return Number(p.usd_foil)||null;
  if(finish==='etched')return Number(p.usd_etched)||null;
  return Number(p.usd)||Number(p.usd_foil)||Number(p.usd_etched)||null;
}

async function collectionLookup(identifiers){
  let attempt=0;
  while(attempt<4){
    attempt++;
    const gap=BATCH_GAP_MS-(Date.now()-lastRequestAt);
    if(gap>0)await sleep(gap);
    lastRequestAt=Date.now();

    const r=await fetch('https://api.scryfall.com/cards/collection',{
      method:'POST',
      headers:{...UA,'content-type':'application/json'},
      body:JSON.stringify({identifiers})
    });

    if(r.ok)return await r.json();

    if(r.status===429){
      const retryRaw=Number(r.headers.get('retry-after')||0);
      const retrySeconds=Number.isFinite(retryRaw)&&retryRaw>0?retryRaw:2;
      // Do not hold a Netlify function open for a full 60-second Scryfall cooldown.
      if(retrySeconds>8){
        const e=Error(`Scryfall is cooling down. Wait about ${Math.ceil(retrySeconds)} seconds, then tap Import pasted CSV again.`);
        e.status=429;
        throw e;
      }
      await sleep(Math.min(8000,Math.max(1200,retrySeconds*1000)));
      continue;
    }

    if(r.status>=500&&attempt<4){
      await sleep(700*attempt);
      continue;
    }

    let detail='';
    try{const d=await r.json();detail=String(d?.details||d?.code||'').slice(0,180)}catch{}
    throw Error(`Scryfall collection lookup returned ${r.status}${detail?`: ${detail}`:''}`);
  }
  throw Error('Scryfall collection lookup did not recover after retries. Please try again in a moment.');
}

export default async req=>{
  if(req.method!=='POST')return json({ok:false,error:'POST required'},405);
  try{
    const body=await req.json(),items=Array.isArray(body?.items)?body.items:[];
    if(!items.length)return json({ok:false,error:'No collection rows supplied'},400);
    if(items.length>3000)return json({ok:false,error:'Import is limited to 3,000 rows at a time'},400);

    const out=[];
    for(let start=0;start<items.length;start+=BATCH_SIZE){
      const batch=items.slice(start,start+BATCH_SIZE);
      const identifiers=batch.map(x=>x.id?{id:x.id}:x.set&&x.collector?{set:String(x.set).toLowerCase(),collector_number:String(x.collector)}:x.name&&x.set?{name:x.name,set:String(x.set).toLowerCase()}:{name:x.name});
      const d=await collectionLookup(identifiers);
      const found=Array.isArray(d.data)?d.data:[];
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
    }

    return json({ok:true,items:out,matched:out.filter(x=>x.matched).length,unmatched:out.filter(x=>!x.matched).length,batches:Math.ceil(items.length/BATCH_SIZE),throttle_ms:BATCH_GAP_MS});
  }catch(e){
    const status=e?.status===429?429:500;
    return json({ok:false,error:e.message||'Collection lookup failed'},status);
  }
};
