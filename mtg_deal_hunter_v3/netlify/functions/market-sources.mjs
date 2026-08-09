const BUILTIN=[
  {id:'stomping-grounds',name:'Stomping Grounds TCG',type:'shopify',base:'https://www.stompinggroundstcg.com',enabled:true,pages:2},
  {id:'big-z-mtg',name:'Big Z MTG',type:'shopify',base:'https://bigzmtg.com',enabled:true,pages:2},
  {id:'vegas-singles',name:'Vegas Singles',type:'shopify',base:'https://vegas.singles',enabled:true,pages:2},
  {id:'magnolia-gaming',name:'Magnolia Gaming',type:'shopify',base:'https://magnoliagames.com',enabled:true,pages:2},
  {id:'simplicity-esports',name:'Simplicity Esports',type:'shopify',base:'https://www.simplicitycardsandgames.com',enabled:true,pages:2}
];

const magicWords=/magic[:\s-]*the gathering|magic the gathering|\bmtg\b|wizards of the coast/i;
const sealedWords=/booster|bundle|commander deck|starter|prerelease|pre-release|display|collector box|play booster box|gift bundle|deck box set/i;
const treatmentWords=/borderless|showcase|extended art|extendedart|retro|old border|surge foil|galaxy foil|serialized|textured|etched|full art/i;
const conditionWords='near mint|nm|lightly played|light play|lp|moderately played|mp|heavily played|hp|damaged';
const finishWords='nonfoil|non-foil|foil|etched|surge foil|galaxy foil|textured foil';

function envSources(){try{const v=JSON.parse(process.env.DEAL_SOURCE_LIBRARY_JSON||'[]');return Array.isArray(v)?v:[]}catch{return[]}}
function uniqueSources(a){const m=new Map();for(const x of a){if(!x?.id||!x?.type)continue;m.set(x.id,x)}return [...m.values()].filter(x=>x.enabled!==false).slice(0,40)}
export function marketSources(){return uniqueSources([...BUILTIN,...envSources()])}

function exactHints(text){
  const s=String(text||'');
  const patterns=[
    /\(([A-Z0-9]{2,8})\s*[-#]\s*([A-Za-z0-9★]+)\)/i,
    /\[([A-Z0-9]{2,8})\s*[-#:]?\s*#?\s*([A-Za-z0-9★]+)\]/i,
    /\b([A-Z0-9]{2,8})\s*#\s*([A-Za-z0-9★]+)\b/i,
    /\b([A-Z0-9]{2,8})\s*-\s*([0-9]{1,4}[A-Za-z★]?)\b/i,
    /\bset\s*[:=-]?\s*([A-Z0-9]{2,8}).{0,25}?\b(?:collector|number|no\.?|#)\s*[:=-]?\s*([A-Za-z0-9★]+)/i
  ];
  for(const p of patterns){const m=s.match(p);if(m)return{set:m[1].toLowerCase(),collector_number:m[2]}}
  return{};
}
function conditionFrom(s){const x=String(s||'');if(/near mint|\bNM\b/i.test(x))return'Near Mint';if(/lightly played|light play|\bLP\b/i.test(x))return'Lightly Played';if(/moderately played|\bMP\b/i.test(x))return'Moderately Played';if(/heavily played|\bHP\b/i.test(x))return'Heavily Played';if(/damaged/i.test(x))return'Damaged';return''}
function finishFrom(s){const x=String(s||'');if(/etched/i.test(x))return'etched';if(/foil/i.test(x)&&!/non[- ]?foil/i.test(x))return'foil';return'nonfoil'}
function treatmentFrom(s){const m=String(s||'').match(treatmentWords);return m?m[0].toLowerCase().replace(/\s+/g,'-'):''}
function setNameHint(s){const x=String(s||'');const pats=[/\(([^()]{4,50})\)/g,/\[([^\]]{4,50})\]/g,/[-–—]\s*([^|•]{4,50})$/];for(const p of pats){const all=[...x.matchAll(p)];for(const m of all.reverse()){const v=String(m[1]||'').trim();if(v&&!/foil|near mint|lightly played|borderless|showcase|extended|etched|\b[A-Z0-9]{2,8}\s*[-#]\s*\d+/i.test(v))return v}}return''}
function cleanCardName(title){
  let s=String(title||'').trim();
  s=s.replace(/\s*\(([A-Z0-9]{2,8})\s*[-#]\s*([A-Za-z0-9★]+)\)\s*/ig,' ')
     .replace(/\s*\[([A-Z0-9]{2,8})\s*[-#:]?\s*#?\s*([A-Za-z0-9★]+)\]\s*/ig,' ')
     .replace(/\s+([A-Z0-9]{2,8})\s*#\s*([A-Za-z0-9★]+)\b.*$/i,'')
     .replace(/\s+([A-Z0-9]{2,8})\s*-\s*([0-9]{1,4}[A-Za-z★]?)\b.*$/i,'')
     .replace(new RegExp(`\\s*[-–—|•:]\\s*(?:${conditionWords})(?:\\s*[-–—|•:].*)?$`,'i'),'')
     .replace(new RegExp(`\\s*[-–—|•:]\\s*(?:${finishWords})(?:\\s*[-–—|•:].*)?$`,'i'),'')
     .replace(/\s*[-–—|•:]\s*(?:borderless|showcase|extended art|extendedart|retro|old border|full art|serialized|textured)(?:\s*[-–—|•:].*)?$/i,'')
     .replace(/\s{2,}/g,' ').replace(/\s*[-–—|•:]\s*$/,'').trim();
  return s;
}
function identityFromProduct(p,v){
  const combined=[p.title,v?.title,v?.sku,Array.isArray(p.tags)?p.tags.join(' '):p.tags,p.product_type,p.vendor].filter(Boolean).join(' '),h=exactHints(combined);
  let name=cleanCardName(p.title);
  if((!name||name.length<2||/^magic[:\s-]*the gathering$/i.test(name))&&v?.title)name=cleanCardName(v.title);
  return{name,h,combined};
}
function relevant(p){const text=[p.title,p.product_type,p.vendor,...(Array.isArray(p.tags)?p.tags:[p.tags])].filter(Boolean).join(' ');return magicWords.test(text)}
function productUrl(source,handle){return `${source.base.replace(/\/$/,'')}/products/${encodeURIComponent(handle)}`}
function shopifyRows(source,products){const rows=[];for(const p of products){if(!relevant(p))continue;const baseText=[p.title,p.product_type,p.vendor,Array.isArray(p.tags)?p.tags.join(' '):p.tags].filter(Boolean).join(' '),isSealed=sealedWords.test(baseText);for(const v of p.variants||[]){if(v.available===false)continue;const price=Number(v.price);if(!(price>0))continue;const {name,h,combined:text}=identityFromProduct(p,v),finish=finishFrom(text),condition=conditionFrom(text),compare=Number(v.compare_at_price)||null,url=productUrl(source,p.handle);if(isSealed){rows.push({candidate_only:true,type:'sealed',name:p.title,product_name:p.title,store:source.name,url,price,compare_at_price:compare,detail:[v.title,compare?`store compare-at $${compare.toFixed(2)}`:''].filter(Boolean).join(' • '),source_id:source.id});continue}if(!name||name.length<2)continue;if(!h.set||!h.collector_number){rows.push({needs_match:true,type:'single',name,card_name:name,store:source.name,url,price,finish,condition,treatment:treatmentFrom(text),set_name_hint:setNameHint(text),raw_title:p.title,variant_title:v.title||'',sku:v.sku||'',detail:[v.title,finish,condition].filter(Boolean).join(' • '),source_id:source.id});continue}rows.push({type:'single',name,card_name:name,store:source.name,url,price,set:h.set,collector_number:h.collector_number,finish,condition,treatment:treatmentFrom(text),detail:[h.set.toUpperCase(),`#${h.collector_number}`,finish,condition].filter(Boolean).join(' • '),source_id:source.id})}}return rows}
async function fetchJson(url,timeout=6500){const ctl=new AbortController(),t=setTimeout(()=>ctl.abort(),timeout);try{const r=await fetch(url,{signal:ctl.signal,headers:{'user-agent':'MTGDealHunter/6.4 market-source-library','accept':'application/json'}});if(!r.ok)throw Error(`HTTP ${r.status}`);return await r.json()}finally{clearTimeout(t)}}
async function fetchShopify(source){const products=[];for(let page=1;page<=Math.max(1,Math.min(4,Number(source.pages||2)));page++){const u=`${source.base.replace(/\/$/,'')}/products.json?limit=250&page=${page}`;const d=await fetchJson(u);const chunk=Array.isArray(d?.products)?d.products:[];products.push(...chunk);if(chunk.length<250)break;await new Promise(r=>setTimeout(r,120))}return{rows:shopifyRows(source,products),raw_count:products.length}}
async function fetchGeneric(source){const d=await fetchJson(source.url),rows=Array.isArray(d)?d:Array.isArray(d?.deals)?d.deals:[];return{rows:rows.slice(0,500),raw_count:rows.length}}
export async function fetchMarketSource(source){const started=Date.now();try{const out=source.type==='shopify'?await fetchShopify(source):source.type==='json'?await fetchGeneric(source):{rows:[],raw_count:0};return{ok:true,source,rows:out.rows,raw_count:out.raw_count,ms:Date.now()-started}}catch(e){return{ok:false,source,rows:[],raw_count:0,error:e.message||String(e),ms:Date.now()-started}}}
