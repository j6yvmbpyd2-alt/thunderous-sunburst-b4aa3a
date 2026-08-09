import baseDecision from './card-intelligence.mjs';
import { json } from './_shared.mjs';

export default async req=>{
  try{
    const response=await baseDecision(req);
    if(response instanceof Response){
      const body=await response.clone().json().catch(()=>null);
      if(body?.ok&&body.intelligence){
        body.intelligence={...body.intelligence,learned_history_used:false,learned_history_status:'collecting-disabled-during-audit'};
        return json(body,response.status||200);
      }
      return response;
    }
    return json(response||{ok:false,error:'Decision unavailable'},response?.ok===false?500:200);
  }catch(e){
    return json({ok:false,error:e.message||'Decision unavailable'},500);
  }
};
