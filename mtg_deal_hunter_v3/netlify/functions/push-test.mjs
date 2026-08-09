import { json } from "./_shared.mjs";
import { sendPush } from "./_push.mjs";

export default async () => {
  const result=await sendPush({title:"MTG Deal Hunter",body:"Test notification — push is working.",url:"/?tab=tracker",tag:"push-test"});
  return json({ok:true,...result});
};
