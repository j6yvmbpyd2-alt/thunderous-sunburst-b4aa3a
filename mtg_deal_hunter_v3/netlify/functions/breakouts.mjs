import { json, store } from "./_shared.mjs";

export default async()=>{
  const d=await store().get('breakout-tracker',{type:'json',consistency:'strong'}).catch(()=>null);
  if(!d) return json({ok:true,updated_at:null,feed_count:0,breakouts:[],message:'No sales feed connected yet'});
  return json({ok:true,updated_at:d.updated_at||null,feed_count:d.feed_count||0,breakouts:d.breakouts||[]});
};
