import runScan from './scan-deals.mjs';
import { store, json } from './_shared.mjs';

export default async()=>{
  try{
    const started=Date.now();
    await runScan({mode:'manual',recoveryLimit:6,prefetchFallbackLimit:2});
    const feed=(await store().get('feed',{type:'json',consistency:'strong'}).catch(()=>null))||{};
    return json({
      ok:true,
      elapsed_ms:Date.now()-started,
      updated_at:feed.updated_at||null,
      source_count:Number(feed.source_count||0),
      items_seen:Number(feed.items_seen||0),
      items_evaluated:Number(feed.items_evaluated||0),
      qualified_this_run:Number(feed.qualified_this_run||0),
      retained_deals:Array.isArray(feed.deals)?feed.deals.length:0,
      threshold:Number(feed.threshold||process.env.DEAL_THRESHOLD||25),
      recovery_limit:Number(feed.recovery_limit||0),
      sources:(feed.source_stats||[]).map(x=>({ok:Boolean(x.ok),items:Number(x.raw_items||x.items||0),ms:Number(x.ms||0),error:x.error||null}))
    });
  }catch(e){return json({ok:false,error:e.message||'Deal scan failed'},500)}
};