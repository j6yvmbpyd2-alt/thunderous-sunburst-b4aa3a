import { store, json, keyFor, normalizeDeal } from "./_shared.mjs";
export default async (req) => {
  if(req.method!=="POST") return json({error:"POST only"},405);
  const expected=process.env.DEAL_ADMIN_TOKEN;
  if(!expected || req.headers.get("x-deal-token")!==expected) return json({error:"Unauthorized"},401);
  let raw; try{raw=await req.json()}catch{return json({error:"Invalid JSON"},400)}
  const d=await normalizeDeal(raw,Number(process.env.DEAL_THRESHOLD||25));
  if(!d) return json({accepted:false,reason:"Deal does not meet threshold or lacks a usable reference market price"},200);
  const s=store(),old=(await s.get("feed",{type:"json",consistency:"strong"}))||{deals:[]};
  const map=new Map([[keyFor(d),d],...(old.deals||[]).map(x=>[keyFor(x),x])]);
  const deals=[...map.values()].sort((a,b)=>(b.discount_pct||0)-(a.discount_pct||0)).slice(0,200);
  await s.setJSON("feed",{...old,updated_at:new Date().toISOString(),deals});
  return json({accepted:true,deal:d});
};
