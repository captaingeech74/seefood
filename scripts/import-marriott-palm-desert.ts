#!/usr/bin/env -S npx tsx
/** Founder-requested, additive import of the three Palm Desert Marriott resort dining rosters. */
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";
import pg from "pg";
import * as cheerio from "cheerio";
import sharp from "sharp";
import { verifiedSupabaseSsl } from "./lib/verifiedSupabaseSsl.mjs";
import { extractPdfMenu } from "../src/crawler/pdfMenu";
import { crawlWebsiteV3 } from "../src/crawler/websiteV3";
import { fingerprintPhoto } from "../src/lib/photoFingerprint";
import type { MenuItemData, DishPhoto } from "../src/lib/types";

const ROOT = "logs/marriott-palm-desert";
const MARKET = "palm-desert-resorts-ca";
const jw = "https://www.marriott.com/en-us/hotels/ctdca-jw-marriott-desert-springs-resort-and-spa/dining/";
const shadow = "https://www.marriott.com/en-us/hotels/ctdst-marriotts-shadow-ridge-ii-the-enclaves/dining/";
const villas = "https://www.marriott.com/en-us/hotels/ctdds-marriotts-desert-springs-villas-i/dining/";
const JW_ADDRESS = "74855 Country Club Drive, Palm Desert, CA 92260";
type Venue = { key:string; name:string; resort:"jw"|"shadow"|"villas"; id?:string; lat:number; lng:number; address:string; website?:string; service?:number; note?:string };
const venues:Venue[] = [
  {key:"rockwood-grill",name:"Rockwood Grill",resort:"jw",id:"1072f8a5-3b47-4bdb-97ee-0d8a31afd423",lat:33.75439238,lng:-116.36194297,address:JW_ADDRESS,service:441},
  {key:"oasis-poolside-bar-grille",name:"Oasis Poolside Bar & Grille",resort:"jw",id:"0c7d2ed9-4e1a-4b2d-a8f1-b1ea663c8c4d",lat:33.75545789,lng:-116.36331534,address:JW_ADDRESS,service:445},
  {key:"mikado-japanese-steakhouse",name:"Mikado Japanese Steakhouse",resort:"jw",id:"e4963359-22ab-4fd9-b31c-92964ccd8126",lat:33.75554564,lng:-116.36409697,address:JW_ADDRESS,service:20},
  {key:"starbucks-jw-marriott",name:"Starbucks at JW Marriott Desert Springs",resort:"jw",id:"3f78289f-67ce-4107-bb11-aeb3d23ab31a",lat:33.75552,lng:-116.36179,address:JW_ADDRESS},
  {key:"fishermans-landing",name:"Fisherman's Landing",resort:"jw",id:"bbac995c-42ea-4e42-abc6-a8bfa43726bf",lat:33.75533421,lng:-116.36320553,address:JW_ADDRESS,website:"https://fishermans.com/page/fishermans-landing"},
  {key:"tt-innovation-kitchen",name:"T&T Innovation Kitchen — Private Events Only",resort:"jw",id:"cf0b00aa-29ea-45bc-98d2-66199a754422",lat:33.756302,lng:-116.358803,address:JW_ADDRESS,note:"Available for private events only; no regular walk-in service."},
  {key:"spa-bistro",name:"Spa Bistro — Spa Access Required",resort:"jw",lat:33.756302,lng:-116.358803,address:JW_ADDRESS,note:"Spa treatment or day pass required. Resort-area location; exact dining-room position is approximate."},
  {key:"blue-star-lounge",name:"Blue Star Lounge",resort:"jw",id:"af7ee441-eda3-499b-a403-b110d15eadae",lat:33.75455464,lng:-116.36201502,address:JW_ADDRESS,service:444},
  {key:"aquifer65-jw-sushi-bar",name:"Aquifer65 & JW Sushi Bar",resort:"jw",id:"217dd7ca-7022-4ab0-bac2-bfdb609f13d8",lat:33.75545835,lng:-116.36173288,address:JW_ADDRESS,service:122},
  {key:"snake-bites-pool-bar-grill",name:"Snake Bites Pool Bar & Grill",resort:"shadow",id:"244481af-a522-48ae-9eba-d6ee51c9f31f",lat:33.774349,lng:-116.381524,address:"9003 Shadow Ridge Road, Palm Desert, CA 92211"},
  {key:"chuckwalla-pool-bar-grill",name:"Chuckwalla Pool Bar & Grill",resort:"shadow",id:"b4e05af2-1691-41b3-9bf9-5c966fa2f0a0",lat:33.7788796122132,lng:-116.386097073555,address:"9009 Shadow Ridge Road, Palm Desert, CA 92211"},
  {key:"marketplace-shadow-ridge",name:"The Marketplace at Marriott's Shadow Ridge",resort:"shadow",lat:33.78242661,lng:-116.38437694,address:"9003 Shadow Ridge Road, Palm Desert, CA 92211",note:"Resort-area location; exact outlet position is approximate."},
  {key:"giuseppes-shadow-ridge",name:"Giuseppes Restaurant & Pizzeria at Shadow Ridge",resort:"shadow",id:"c8315de1-9040-438d-99f6-3b48df12cd5d",lat:33.78242661,lng:-116.38437694,address:"9002 Shadow Ridge Road, Palm Desert, CA 92211",website:"https://www.giuseppesrestaurants.com/palm-desert/"},
  {key:"bunker-shadow-ridge",name:"The Bunker at Shadow Ridge",resort:"shadow",lat:33.78242661,lng:-116.38437694,address:"9002 Shadow Ridge Road, Palm Desert, CA 92211",note:"Golf-course dining outlet; exact outlet position is approximate."},
  {key:"waters-edge-bar-grill",name:"The Water's Edge Bar & Grill",resort:"villas",id:"492999fa-5002-405c-9ecf-49f424f36bef",lat:33.75056749,lng:-116.36057615,address:"100 Bougainvillea Circle, Palm Desert, CA 92260"},
  {key:"marketplace-desert-springs-villas",name:"The Marketplace at Marriott's Desert Springs Villas",resort:"villas",lat:33.75056749,lng:-116.36057615,address:"1091 Pinehurst Lane, Palm Desert, CA 92260",note:"Resort-area location; exact outlet position is approximate."},
];
const normalize=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();
function uuid(key:string){const h=createHash("sha256").update(`seefood-marriott-palm-desert:${key}`).digest("hex");return `${h.slice(0,8)}-${h.slice(8,12)}-4${h.slice(13,16)}-8${h.slice(17,20)}-${h.slice(20,32)}`;}
const id=(v:Venue)=>v.id??uuid(v.key);
const page=(v:Venue)=>v.resort==="jw"?jw:v.resort==="shadow"?shadow:villas;
const parent=(v:Venue)=>v.resort==="jw"?"046bddf4-826b-41ed-a085-c83c5ecde2ca":uuid(`parent-${v.resort}`);
function env(){for(const l of readFileSync(".env.local","utf8").split("\n")){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}}
async function connect(){env();const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"")),ssl:verifiedSupabaseSsl(),application_name:"seefood-marriott-palm-desert"});await db.connect();return db;}
async function collect(){
  const services=(await(await fetch("https://jwdesertsprings.247activities.com/api/service/get-services?active=1&include_service_type=true")).json() as any).services;
  const html=await(await fetch(jw)).text(),$=cheerio.load(html);
  const officialImages=$("img").map((_,e)=>({label:$(e).attr("alt")??"",url:$(e).attr("data-src")??$(e).attr("src")??""})).get().filter(x=>x.url&&/Mole|Lamb Chops|Makimono|Avocado Toast|Charcuterie/i.test(x.label));
  const result:any={at:new Date().toISOString(),venues:{},officialImages};
  for(const v of venues){
    const service=services.find((s:any)=>s.id===v.service);
    const urls:string[]=[...new Set<string>([...(service?.attachments??[]).map((a:any)=>a.link),...[...String((service?.short_description??"")+(service?.long_description??"")).matchAll(/href="([^\"]+\.pdf[^\"]*)"/g)].map(m=>m[1])])].filter(u=>/\.pdf/i.test(u)&&!/wine|cocktail|beverage/i.test(u));
    const menus:any[]=[];
    for(const url of urls){try{const extracted=await extractPdfMenu(url);menus.push({url,...extracted});}catch(e){menus.push({url,error:String(e)});}}
    let crawl;
    if(v.website){try{crawl=await crawlWebsiteV3({websiteId:v.key,entityId:id(v),jobId:v.key,leaseToken:"local-reviewed",url:v.website,domain:new URL(v.website).hostname,restaurantName:v.name,restaurantAddress:v.address,attempts:1},{renderEnabled:true,maxPages:6,deepDiscovery:false});}catch(e){crawl={error:String(e)};}}
    result.venues[v.key]={menus,crawl};
    writeFileSync(`${ROOT}/collection.json`,JSON.stringify(result,null,2));
    console.log(JSON.stringify({name:v.name,pdfs:menus.length,items:menus.reduce((n,m)=>n+(m.items?.length??0),0),webItems:crawl&&"items"in crawl?crawl.items.length:0}));
  }
}
async function identities(){
  const db=await connect();
  try{
    const before:any={at:new Date().toISOString(),tables:{}};
    for(const table of ["restaurant_entities","restaurants","restaurant_identities","restaurant_websites"]){const column=table==="restaurant_entities"?"id":"entity_id";before.tables[table]=(await db.query(`select * from ${table} where ${column}=any($1::uuid[])`,[[...venues.map(id),...venues.map(parent)]])).rows;}
    if(!existsSync(`${ROOT}/before.json`))writeFileSync(`${ROOT}/before.json`,JSON.stringify(before,null,2),{flag:"wx"});
    await db.query("begin isolation level serializable");
    await db.query(`insert into acquisition_markets(market_key,name,market_type,bounds,state_code,status) values($1,'Palm Desert — Marriott resorts','city','{"west":-116.393,"south":33.745,"east":-116.35,"north":33.79}','CA','enriching') on conflict(market_key) do nothing`,[MARKET]);
    for(const resort of ["jw","shadow","villas"] as const){const v=venues.find(v=>v.resort===resort)!;await db.query(`insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,backbone_state,venue_kind) values($1,$2,$3,$4,$5,$6,$7,'identity_only','published','resort') on conflict(id) do nothing`,[parent(v),resort==="jw"?"JW Marriott Desert Springs Resort & Spa":resort==="shadow"?"Marriott's Shadow Ridge":"Marriott's Desert Springs Villas",resort,v.address,v.lat,v.lng,page(v)]);}
    for(const v of venues){
      const website=v.website??`${page(v)}#${v.key}`,providerId=`${page(v)}#${v.key}`;
      await db.query(`insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,categories,operating_status,backbone_state,parent_entity_id,venue_kind) values($1,$2,$3,$4,$5,$6,$7,'active',array['restaurant'],'open','published',$8,'resort_restaurant') on conflict(id) do update set name=excluded.name,normalized_name=excluded.normalized_name,address=excluded.address,website=excluded.website,status='active',operating_status='open',backbone_state='published',parent_entity_id=excluded.parent_entity_id,venue_kind=excluded.venue_kind,updated_at=now()`,[id(v),v.name,normalize(v.name),v.address,v.lat,v.lng,website,parent(v)]);
      await db.query(`insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active) values($1,'official_website',$2,$3,$4,$5,$6,$7,$8,1,$9::jsonb,now(),true) on conflict(provider,provider_id) do update set last_seen_at=now(),active=true`,[id(v),providerId,page(v),v.name,v.address,v.lat,v.lng,website,JSON.stringify({source:"Marriott on-property dining roster",note:v.note??null,serviceId:v.service??null})]);
      const existing=(await db.query("select place_id from restaurants where entity_id=$1 order by created_at limit 1",[id(v)])).rows[0];
      if(existing&&existing.place_id!==`seefood:${id(v)}`)throw new Error(`Unexpected existing live row for ${v.name}; review before importing`);
      await db.query(`insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id) values($1,$2,$3,$4,$5,$6,$7,'active',$8) on conflict(place_id) do nothing`,[`seefood:${id(v)}`,`${v.key}-palm-desert`,v.name,v.lat,v.lng,v.address,website,id(v)]);
      await db.query(`insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active) values($1,$2,'founder_qa',now(),true) on conflict(market_key,entity_id,source) do update set active=true,last_seen_at=now()`,[MARKET,id(v)]);
      // Only venue-specific sites enter the shared crawler; a resort-wide page
      // must never donate another outlet's menu or gallery to every restaurant.
      if(v.website)await db.query(`insert into restaurant_websites(entity_id,url,domain,source,active,updated_at) values($1,$2,$3,'founder_qa',true,now()) on conflict(entity_id,url) do update set active=true,updated_at=now()`,[id(v),v.website,new URL(v.website).hostname]);
    }
    await db.query("commit");console.log(JSON.stringify({published:venues.length,existingCandidates:venues.filter(v=>v.id).length,created:venues.filter(v=>!v.id).length}));
  }catch(e){await db.query("rollback");throw e;}finally{await db.end();}
}
async function prepareContent(){
  const collection=JSON.parse(readFileSync(`${ROOT}/collection.json`,"utf8"));
  const reviewed=JSON.parse(readFileSync("scripts/config/marriott-palm-desert-reviewed.json","utf8"));
  const prepared:any={at:new Date().toISOString(),venues:{}};
  const photoBytes=new Map<string,Buffer>();
  const aliases:Record<string,string>={"our caesar salad":"Caesar Salad","arugula":"Arugula Salad","caprese":"Tomato Caprese","giuseppes house salad":"Giuseppe's House Salad","giuseppe s house salad":"Giuseppe's House Salad","chopped italian salad":"Italian Chopped Salad","eggplant alla parm":"Eggplant Parmigiana","chicken alla parm":"Chicken Parmigiana","marinara":"Spaghetti Marinara","marinara spaghetti":"Spaghetti Marinara","bolognese":"Spaghetti Bolognese","bolognese spaghetti":"Spaghetti Bolognese","crispy brussel sprouts":"Crispy Brussels Sprouts","sausage w pink vodka sauce":"Sausage & Pink Vodka Sauce"};
  Object.assign(aliases,{salmon:"Grilled Salmon","meat lasagna":"Lasagna"});
  for(const v of venues){
    const data=collection.venues[v.key],unique=new Map<string,MenuItemData>();
    for(const name of reviewed[v.key]??[])unique.set(normalize(name),{name,source:"schema_org"});
    for(const evidence of data.crawl?.items??[]){
      if(!evidence.evidenceUrl.includes("/palm-desert/")||evidence.confidence<0.78)continue;
      const item={...evidence.item,source:"schema_org" as const};
      if(/^(?:protein add|add |now available|personal(?:\s|$)|small(?:\s|$)|medium(?:\s|$)|large(?:\s|$)|frittatas)/i.test(item.name))continue;
      item.name=aliases[normalize(item.name)]??item.name;
      const old=unique.get(normalize(item.name));if(!old||(!old.imageUrl&&item.imageUrl))unique.set(normalize(item.name),item);
    }
    const items=[...unique.values()];
    for(const item of items){
      if(!item.imageUrl)continue;
      // The restaurant's WordPress originals retain the same asset identity.
      const original=item.imageUrl.replace(/-\d+x\d+(?=\.[a-z]+(?:\?|$))/i,"");
      try{const response=await fetch(original,{signal:AbortSignal.timeout(15000)});if(!response.ok||!response.headers.get("content-type")?.startsWith("image/"))throw new Error("not image");const bytes=Buffer.from(await response.arrayBuffer()),meta=await sharp(bytes).metadata(),stats=await sharp(bytes).stats();if((meta.width??0)<300||(meta.height??0)<240||stats.channels.every(c=>c.stdev<2))throw new Error("unusable image");const hashes=await fingerprintPhoto(bytes);Object.assign(item,{imageUrl:original,...hashes,imageWidth:meta.width,imageHeight:meta.height});photoBytes.set(hashes.contentHash,bytes);}catch{delete item.imageUrl;}
    }
    const photos:any[]=[];
    if(v.key==="giuseppes-shadow-ridge")for(const item of items){
      if(item.imageUrl&&["Spaghetti Marinara","Tiger Shrimp Scampi"].includes(item.name)){
        photos.push({url:item.imageUrl,label:"Official restaurant food photo; dish label withheld after visual review",contentHash:item.contentHash,perceptualHash:item.perceptualHash,width:item.imageWidth,height:item.imageHeight,evidenceUrl:v.website});delete item.imageUrl;
      }
      if(["Italian Sausage & Shrimp","Baked Penne Bolognese"].includes(item.name))delete item.imageUrl;
    }
    prepared.venues[v.key]={items,photos,evidenceUrls:[...(data.menus??[]).map((m:any)=>m.url),...(data.crawl?.pages??[]).map((p:any)=>p.finalUrl)]};
  }
  // Shared pool menu is explicitly labelled for both Shadow Ridge outlets.
  prepared.sharedMenuEvidence="https://content-stg.vistana.com/files/live/sites/vistana-digital-content-manager/files/documents/Menu/CTDSR%20Marriott%27s%20Shadow%20Ridge/CTDSR-Chuckwalla_Snakebites.pdf";
  const $=cheerio.load(await(await fetch(jw)).text());
  const selection=[{key:"mikado-japanese-steakhouse",match:/Makimono cut rolls/i},{key:"spa-bistro",match:/Avocado Toast/i},{key:"blue-star-lounge",match:/Charcuterie/i},{key:"tt-innovation-kitchen",match:/Kitchen - Mole|Kitchen - Lamb Chops/i}];
  for(const rule of selection)for(const e of $("img").toArray().filter(e=>rule.match.test(e.attribs.alt??""))){
    const url=e.attribs["data-src"]??e.attribs.src;if(!url?.startsWith("https://"))continue;
    const response=await fetch(url,{signal:AbortSignal.timeout(15000)});if(!response.ok)continue;const bytes=Buffer.from(await response.arrayBuffer()),meta=await sharp(bytes).metadata(),hashes=await fingerprintPhoto(bytes);
    const item=rule.key==="blue-star-lounge"?prepared.venues[rule.key].items.find((i:MenuItemData)=>i.name==="Cheese and Charcuterie"):null;
    if(item)Object.assign(item,{imageUrl:url,...hashes,imageWidth:meta.width,imageHeight:meta.height});
    else prepared.venues[rule.key].photos.push({url,label:e.attribs.alt,...hashes,width:meta.width,height:meta.height,evidenceUrl:jw});
    photoBytes.set(hashes.contentHash,bytes);
  }
  const cells:Buffer[]=[];
  for(const [hash,bytes]of photoBytes){const index=cells.length;const thumb=await sharp(bytes).resize(220,160,{fit:"contain",background:"#222"}).jpeg().toBuffer();const label=Buffer.from(`<svg width="220" height="24"><rect width="220" height="24" fill="white"/><text x="6" y="17" font-size="14">${index}: ${hash.slice(0,10)}</text></svg>`);cells.push(await sharp({create:{width:220,height:184,channels:3,background:"white"}}).composite([{input:thumb,left:0,top:0},{input:label,left:0,top:160}]).jpeg().toBuffer());}
  if(cells.length)await sharp({create:{width:880,height:Math.ceil(cells.length/4)*184,channels:3,background:"#111"}}).composite(cells.map((input,i)=>({input,left:i%4*220,top:Math.floor(i/4)*184}))).jpeg().toFile(`${ROOT}/photo-review.jpg`);
  writeFileSync(`${ROOT}/prepared.json`,JSON.stringify(prepared,null,2));
  console.log(JSON.stringify({uniquePhotos:photoBytes.size,venues:Object.fromEntries(Object.entries(prepared.venues).map(([k,v]:[string,any])=>[k,{items:v.items.length,matched:v.items.filter((i:MenuItemData)=>i.imageUrl).length,unmatched:v.photos.length}]))},null,2));
}
async function content(){
  env();const {persistSourceMenuItems,persistSourcePhotos}=await import("../src/lib/db");
  const prepared=JSON.parse(readFileSync(`${ROOT}/prepared.json`,"utf8"));
  for(const v of venues){
    const data=prepared.venues[v.key],items=data.items;
    if(items.length)await persistSourceMenuItems(`seefood:${id(v)}`,"schema_org",items,{partial:true});
    const photos:DishPhoto[]=data.photos.map((p:any)=>({id:`schema_org-${p.contentHash}`,url:p.url,dishName:null,dishDescription:null,isMenuMatch:false,source:"schema_org",attribution:"owner",tier:3,width:p.width,height:p.height,loveCount:0,primaryVotes:0,photoAuthorType:"management",trustLabel:"management_photo",photoQualityScore:75,isHeroCandidate:false,isStorefront:false,isMenuPhoto:false,contentHash:p.contentHash,perceptualHash:p.perceptualHash}));
    if(photos.length)await persistSourcePhotos(`seefood:${id(v)}`,"schema_org",photos);
    console.log(JSON.stringify({name:v.name,items:items.length,matchedPhotos:items.filter((i:MenuItemData)=>i.imageUrl).length,unmatchedPhotos:photos.length}));
  }
}
async function verify(){
  const db=await connect();
  try {
    const result=await db.query(`select r.name,r.slug,r.status,r.address,
      (select count(*)::int from menu_items m where m.restaurant_id=r.place_id and m.active) menu_items,
      (select count(*)::int from photos p where p.restaurant_id=r.place_id and p.active) photos,
      (select count(*)::int from photos p where p.restaurant_id=r.place_id and p.active and p.menu_item_id is not null) matched_photos
      from restaurants r where r.entity_id=any($1::uuid[]) order by r.name`,[venues.map(id)]);
    if(result.rows.length!==16)throw new Error(`Expected 16 live venues; found ${result.rows.length}`);
    writeFileSync(`${ROOT}/verification.json`,JSON.stringify({at:new Date().toISOString(),rows:result.rows},null,2));
    console.log(JSON.stringify(result.rows,null,2));
  } finally {await db.end();}
}
async function main(){mkdirSync(ROOT,{recursive:true});if(process.argv.includes("--collect"))return collect();if(process.argv.includes("--prepare-content"))return prepareContent();if(process.argv.includes("--publish-identities"))return identities();if(process.argv.includes("--publish-content"))return content();if(process.argv.includes("--verify"))return verify();console.log(JSON.stringify(venues.map(v=>({...v,entityId:id(v),slug:`${v.key}-palm-desert`})),null,2));}
main().catch(e=>{console.error(e);process.exitCode=1;});
