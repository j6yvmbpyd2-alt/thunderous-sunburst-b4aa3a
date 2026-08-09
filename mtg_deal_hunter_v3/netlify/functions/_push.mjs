import webpush from "web-push";
import { store } from "./_shared.mjs";

export function pushConfigured(){
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

function configure(){
  if(!pushConfigured()) return false;
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || "mailto:mtg-deal-hunter@example.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
  return true;
}

export async function sendPush(payload){
  if(!configure()) return {sent:0,configured:false};
  const s=store();
  const saved=await s.get("push-subscriptions",{type:"json",consistency:"strong"}).catch(()=>null);
  const subscriptions=Array.isArray(saved?.subscriptions)?saved.subscriptions:[];
  let sent=0;
  const keep=[];
  for(const sub of subscriptions){
    try{
      await webpush.sendNotification(sub,JSON.stringify(payload),{TTL:300});
      keep.push(sub); sent++;
    }catch(e){
      if(![404,410].includes(e?.statusCode)) keep.push(sub);
    }
  }
  if(keep.length!==subscriptions.length){
    await s.setJSON("push-subscriptions",{subscriptions:keep,updated_at:new Date().toISOString()}).catch(()=>{});
  }
  return {sent,configured:true};
}
