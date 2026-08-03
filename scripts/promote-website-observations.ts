#!/usr/bin/env -S npx tsx
/** Promote staged website menus for entities already attached to the product. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

function loadEnv() {
  const path=join(__dirname,"..",".env.local"); if(!existsSync(path)) throw new Error(`Missing ${path}`);
  for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}
}
function argument(name:string,fallback?:string){const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:fallback;}

async function main(){
  loadEnv();
  const market=argument("market"); if(!market) throw new Error("Usage: npm run acquisition:promote-websites -- --market temecula-ca [--limit 100]");
  const limit=Math.min(500,Math.max(1,Number(argument("limit","100"))));
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-website-promotion"});
  await db.connect();
  const rows=(await db.query(
    `select o.entity_id,r.place_id,o.source_key,jsonb_agg(jsonb_build_object('name',o.item_name,'description',o.item_description,'imageUrl',o.image_url,'price',o.price) order by o.id) items
     from website_menu_observations o join restaurants r on r.entity_id=o.entity_id
     join acquisition_market_entities m on m.entity_id=o.entity_id and m.market_key=$1 and m.active
     where o.active group by o.entity_id,r.place_id,o.source_key order by count(*) desc limit $2`,[market,limit]
  )).rows;
  await db.end();
  const {persistSourceMenuItems}=await import("../src/lib/db");
  const {fingerprintPhoto,isImageContentType}=await import("../src/lib/photoFingerprint");
  type MenuItemData=import("../src/lib/types").MenuItemData;
  type DataSource=import("../src/lib/types").DataSource;
  const stats={groups:rows.length,promoted:0,items:0,photoCandidates:0,byteVerifiedPhotos:0};
  for(const row of rows){
    const items=row.items as MenuItemData[];
    let cursor=0;
    async function worker(){while(cursor<items.length){const index=cursor++,item=items[index];if(!item.imageUrl)continue;stats.photoCandidates++;
      try{const response=await fetch(item.imageUrl,{headers:{accept:"image/*"},signal:AbortSignal.timeout(15_000)});if(!response.ok||!isImageContentType(response.headers.get("content-type")))continue;
        const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length||bytes.length>20*1024*1024)continue;const hashes=await fingerprintPhoto(bytes);items[index]={...item,...hashes};stats.byteVerifiedPhotos++;}catch{}
    }}
    await Promise.all(Array.from({length:Math.min(8,items.length)},()=>worker()));
    const source=(row.source_key||"schema_org") as DataSource;
    const snapshot=await persistSourceMenuItems(row.place_id,source,items);
    if(snapshot){stats.promoted++;stats.items+=items.length;}
  }
  console.log(JSON.stringify({market,...stats},null,2));
}
main().catch((error)=>{console.error(error);process.exitCode=1;});
