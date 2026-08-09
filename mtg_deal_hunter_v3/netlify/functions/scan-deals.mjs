import { store, keyFor, normalizeDeal } from "./_shared.mjs";

const fetchJSON=async url=>{
  const ctl=new AbortController(); const t=setTimeout(()=>ctl.abort(),6000);
  try{const r=await fetch(url,{signal:ctl.signal,headers:{"user-agent":"MTGDealHunter/3.0"}});if(!r.ok)throw Error(`${r.status} ${url}`);return await r.json()}finally{clearTimeout(t)}
};

export default async () => {
  const threshold=Number(process.env.DEAL_THRESHOLD||25);
  const urls=(process.env.DEAL_FEED_URLS||"").split(",").map(x=>x.trim()).filter(Boolean).slice(0,10);
  const incoming=[];
  const results=await Promise.allSettled(urls.map(fetchJSON));
  for(const r of results){if(r.status!=="fulfilled")continue;const v=r.value;const list=Array.isArray(v)?v:(Array.isArray(v.deals)?v.deals:[]);incoming.push(...list.slice(0,100))}
  const qualified=[];
  for(const raw of incoming.slice(0,250)){
    try{const d=await normalizeDeal(raw,threshold);if(d)qualified.push(d)}catch{}
  }
  const s=store();
  const old=(await s.get("feed",{type:"json",consistency:"strong"}))||{deals:[]};
  const map=new Map();
  for(const d of [...qualified,...(old.deals||[])]){const k=keyFor(d);if(!map.has(k))map.set(k,d)}
  const cutoff=Date.now()-7*24*60*60*1000;
  const deals=[...map.values()].filter(d=>!d.found_at||new Date(d.found_at).getTime()>=cutoff).sort((a,b)=>(b.discount_pct||0)-(a.discount_pct||0)).slice(0,200);
  await s.setJSON("feed",{updated_at:new Date().toISOString(),source_count:urls.length,threshold,deals});
};
