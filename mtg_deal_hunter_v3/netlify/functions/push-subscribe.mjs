import { json, store } from "./_shared.mjs";

export default async (req) => {
  if(req.method!=="POST") return json({ok:false,error:"POST required"},405);
  try{
    const sub=await req.json();
    if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth) return json({ok:false,error:"Invalid push subscription"},400);
    const s=store();
    const saved=await s.get("push-subscriptions",{type:"json",consistency:"strong"}).catch(()=>null);
    const list=Array.isArray(saved?.subscriptions)?saved.subscriptions:[];
    const next=[sub,...list.filter(x=>x.endpoint!==sub.endpoint)].slice(0,25);
    await s.setJSON("push-subscriptions",{subscriptions:next,updated_at:new Date().toISOString()});
    return json({ok:true,count:next.length});
  }catch(e){
    return json({ok:false,error:e.message||"Subscribe failed"},500);
  }
};
