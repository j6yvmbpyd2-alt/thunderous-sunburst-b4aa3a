import { store, keyFor, normalizeDeal } from "./_shared.mjs";
import { marketSources, fetchMarketSource } from './market-sources.mjs';

const MAX_SOURCES=40,ITEMS_PER_SOURCE=250,MAX_INCOMING=1500,CONCURRENCY=18;
const fetchJSON=async url=>{const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),6500);try{const r=await fetch(url,{signal:ctl.signal,headers:{"user-agent":"MTGDealHunter/5.3 broad-sweep","accept":"application/json"}});if(!r.ok)throw Error(`${r.status} ${url}`);return await r.json()}finally{clearTimeout(t)}};
async function mapLimit(items,limit,fn){const out=[];let next=0;async function worker(){while(next<items.length){const i=next++;try{out[i]=await fn(items[i],i)}catch{out[i]=null}}}await Promise.all(Array.from({length:Math.min(limit,items.length)},worker));return out}

export default async () => {
  const threshold=Number(process.env.DEAL_THRESHOLD||25),incoming=[],sourceStats=[],candidateOnly=[];
  const builtins=marketSources().slice(0,MAX_SOURCES);
  const sourceResults=await mapLimit(builtins,8,fetchMarketSource);
  for(const x of sourceResults.filter(Boolean)){
    sourceStats.push({id:x.source?.id,name:x.source?.name,type:x.source?.type,ok:x.ok,raw_items:x.raw_count||0,usable_items:x.rows?.length||0,ms:x.ms||0,error:x.error||null});
    for(const row of x.rows||[]){if(row.candidate_only)candidateOnly.push(row);else incoming.push(row)}
  }

  const remaining=Math.max(0,MAX_SOURCES-builtins.length),urls=[...new Set((process.env.DEAL_FEED_URLS||"").split(",").map(x=>x.trim()).filter(Boolean))].slice(0,remaining);
  const legacy=await mapLimit(urls,8,async(url,idx)=>{const started=Date.now();try{const v=await fetchJSON(url),list=Array.isArray(v)?v:(Array.isArray(v.deals)?v.deals:[]);sourceStats.push({id:`feed-${idx+1}`,name:`Configured feed ${idx+1}`,type:'json',ok:true,raw_items:list.length,usable_items:Math.min(list.length,ITEMS_PER_SOURCE),ms:Date.now()-started});return list.slice(0,ITEMS_PER_SOURCE)}catch(e){sourceStats.push({id:`feed-${idx+1}`,name:`Configured feed ${idx+1}`,type:'json',ok:false,raw_items:0,usable_items:0,error:e.message,ms:Date.now()-started});return[]}});
  for(const rows of legacy)incoming.push(...(rows||[]));

  const candidates=incoming.slice(0,MAX_INCOMING),normalized=await mapLimit(candidates,CONCURRENCY,async raw=>{try{return await normalizeDeal(raw,threshold)}catch{return null}}),qualified=normalized.filter(Boolean),s=store(),old=(await s.get("feed",{type:"json",consistency:"strong"}))||{deals:[]},map=new Map();
  for(const d of [...qualified,...(old.deals||[])]){const k=keyFor(d);if(!map.has(k))map.set(k,d)}
  const cutoff=Date.now()-7*24*60*60*1000,deals=[...map.values()].filter(d=>!d.found_at||new Date(d.found_at).getTime()>=cutoff).sort((a,b)=>(b.discount_pct||0)-(a.discount_pct||0)).slice(0,500);
  await s.setJSON("feed",{updated_at:new Date().toISOString(),source_count:builtins.length+urls.length,healthy_sources:sourceStats.filter(x=>x.ok).length,source_stats:sourceStats,items_seen:sourceStats.reduce((n,x)=>n+Number(x.raw_items||0),0),items_usable:incoming.length,items_evaluated:candidates.length,candidate_only_count:candidateOnly.length,qualified_this_run:qualified.length,threshold,deals,candidates:candidateOnly.slice(0,100)});
};
