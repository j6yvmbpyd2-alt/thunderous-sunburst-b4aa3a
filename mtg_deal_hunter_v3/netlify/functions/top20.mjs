import { json, store } from "./_shared.mjs";

export default async () => {
  const data=await store().get("top20-tracker",{type:"json",consistency:"strong"}).catch(()=>null);
  if(!data) return json({ok:true,updated_at:null,top20:[],message:"Tracker has not run yet"});
  return json({ok:true,updated_at:data.updated_at||null,candidate_count:data.candidate_count||0,top20:data.top20||[]});
};
