import { json } from "./_shared.mjs";
export default async () => json({ok:true,app:"MTG Deal Hunter",version:3,time:new Date().toISOString()});
