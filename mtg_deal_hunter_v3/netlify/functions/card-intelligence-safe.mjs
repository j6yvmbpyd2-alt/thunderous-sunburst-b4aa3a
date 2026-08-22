import baseDecision from './card-intelligence.mjs';
import { json } from './_shared.mjs';

export default async req=>{
  try{
    const response=await baseDecision(req);
    if(response instanceof Response)return response;
    return json(response||{ok:false,error:'Decision unavailable'},response?.ok===false?500:200);
  }catch(e){
    return json({ok:false,error:e.message||'Decision unavailable'},500);
  }
};
