import { json } from "./_shared.mjs";
import { pushConfigured } from "./_push.mjs";

export default async () => json({
  ok:true,
  configured:pushConfigured(),
  publicKey:pushConfigured()?process.env.VAPID_PUBLIC_KEY:null
});
