import { store, keyFor, normalizeDeal } from "./_shared.mjs";

const MAX_SOURCES=40,ITEMS_PER_SOURCE=175,MAX_INCOMING=1200,CONCURRENCY=18;
const fetchJSON=async url=>{
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),6500);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{"user-agent":"MTGDealHunter/5.0 broad-sweep","accept":"application/json"}});if(!r.ok)throw Error(`${r.status} ${url}`);return await r.json()}finally{clearTimeout(t)}
};
async function mapLimit(items,limit,fn){const out=[];let next=0;async function worker(){while(next<items.length){const i=next++;try{out[i]=await fn(items[i],i)}catch{out[i]=null}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out}

export default async () => {
  const threshold=Number(process.env.DEAL_THRESHOLD||25);
  const urls=[...new Set((process.env.DEAL_FEED_URLS||"").split(",").map(x=>x.trim()).filter(Boolean))].slice(0,MAX_SOURCES);
  const incoming=[],sourceStats=[];
  const fetched=await mapLimit(urls,12,async url=>{const started=Date.now();try{const v=await fetchJSON(url),list=Array.isArray(v)?v:(Array.isArray(v.deals)?v.deals:[]);sourceStats.push({url,ok:true,items:list.length,ms:Date.now()-started});return list.slice(0,ITEMS_PER_SOURCE)}catch(e){sourceStats.push({url,ok:false,error:e.message,ms:Date.now()-started});return[]}});
  for(const list of fetched)incoming.push(...(list||[]));
  const candidates=incoming.slice(0,MAX_INCOMING);
  const normalized=await mapLimit(candidates,CONCURRENCY,async raw=>{try{return await normalizeDeal(raw,threshold)}catch{return null}});
  const qualified=normalized.filter(Boolean),s=store(),old=(await s.get("feed",{type:"json",consistency:"strong"}))||{deals:[]};
  const map=new Map();
  for(const d of [...qualified,...(old.deals||[])]){const k=keyFor(d);if(!map.has(k))map.set(k,d)}
  const cutoff=Date.now()-7*24*60*60*1000;
  const deals=[...map.values()].filter(d=>!d.found_at||new Date(d.found_at).getTime()>=cutoff).sort((a,b)=>(b.discount_pct||0)-(a.discount_pct||0)).slice(0,500);
  await s.setJSON("feed",{updated_at:new Date().toISOString(),source_count:urls.length,source_stats:sourceStats,items_seen:incoming.length,items_evaluated:candidates.length,qualified_this_run:qualified.length,threshold,deals});
};
