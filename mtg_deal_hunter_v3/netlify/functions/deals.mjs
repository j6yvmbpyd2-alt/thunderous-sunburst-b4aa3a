import { store, json } from "./_shared.mjs";
export default async () => {
  try {
    const data=await store().get("feed",{type:"json",consistency:"strong"});
    return json(data||{updated_at:null,deals:[]});
  } catch (e) { return json({updated_at:null,deals:[],error:e.message},200); }
};
