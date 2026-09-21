#!/usr/bin/env -S npx tsx
/** Publish a reviewed local extraction manifest. No discovery, no paid calls.
 * Preview by default. Each group has a durable preimage and completion journal.
 * Partial reconciliation deliberately never removes omitted source evidence. */
import { existsSync, readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { createHash } from "node:crypto";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { DataSource, MenuItemData } from "../src/lib/types";
import { canonicalizeWebsiteImageUrl } from "../src/crawler/websiteV3";

const option=(name:string)=>process.argv.find(v=>v.startsWith(`--${name}=`))?.slice(name.length+3);
const normalize=(s:string)=>s.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();
const sources=new Set(["schema_org","menufy","toast","square","clover","chownow","olo","popmenu","bentobox","owner","spothopper","spoton","slice","flipdish","lightspeed","gloriafood"]);

async function main(){
  const manifestPath=option("manifest");if(!manifestPath)throw new Error("--manifest=reviewed.json required");
  const manifest=JSON.parse(readFileSync(manifestPath,"utf8"));
  const publish=process.argv.includes("--publish");
  const directory=resolve(dirname(manifestPath),"publication");mkdirSync(directory,{recursive:true});
  for(const line of readFileSync(".env.local","utf8").split("\n")){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"")),ssl:{rejectUnauthorized:false}});await db.connect();
  try{
    const {persistSourceMenuItems}=await import("../src/lib/db");
    for(const group of manifest.groups){
      if(!group.identityEvidence||!group.entityId||!group.items?.length)throw new Error("Reviewed identity and items required");
      const restaurant=(await db.query("select place_id from restaurants where entity_id=$1 and status not in ('inactive','test_fixture') order by place_id",[group.entityId])).rows;
      // One selected row per entity; never create a second identity or fan out.
      const placeId=group.placeId??restaurant[0]?.place_id;
      if(!placeId||!restaurant.some(r=>r.place_id===placeId))throw new Error(`Not a live restaurant: ${group.name}`);
      const source=(sources.has(group.source)?group.source:"schema_org") as DataSource;
      const unique=new Map<string,MenuItemData>();
      for(const evidence of group.items){
        const item=evidence.item as MenuItemData;
        if(evidence.confidence<0.78||!evidence.evidenceUrl||!item.name||/^(extra|add|substitute|choice of)\b/i.test(item.name))continue;
        if(/\b(hand sanitizer|sanitiser|t[- ]?shirts?|hoodies?|gift cards?)\b/i.test(item.name))continue;
        const key=normalize(item.name);if(!unique.has(key))unique.set(key,{...item,source});
      }
      const items=[...unique.values()];if(!items.length||items.length>300)throw new Error(`Review size for ${group.name}: ${items.length}`);
      const key=createHash("sha256").update(JSON.stringify({placeId,source,items})).digest("hex");
      const journal=resolve(directory,`${key}.done.json`),backup=resolve(directory,`${key}.before.json`);
      if(existsSync(journal)){console.log(JSON.stringify({name:group.name,status:"already_completed"}));continue;}
      if(!publish){console.log(JSON.stringify({name:group.name,placeId,source,items:items.length,photos:items.filter(i=>i.imageUrl).length,status:"preview"}));continue;}
      if(existsSync(backup))throw new Error(`Interrupted publication needs inspection before retry: ${group.name}`);
      let cursor=0,rejected=0;
      await Promise.all(Array.from({length:6},async()=>{while(cursor<items.length){const index=cursor++,item=items[index];if(!item.imageUrl)continue;
        try{
          item.imageUrl=canonicalizeWebsiteImageUrl(item.imageUrl)??item.imageUrl;
          const response=await fetch(item.imageUrl,{headers:{accept:"image/*"},signal:AbortSignal.timeout(15000)});
          if(!response.ok||!isImageContentType(response.headers.get("content-type")))throw new Error("not image");
          const bytes=Buffer.from(await response.arrayBuffer());if(bytes.length>20*1024*1024)throw new Error("oversized");
          const meta=await sharp(bytes,{failOn:"error"}).metadata();const width=meta.width??0,height=meta.height??0;
          if(width<200||height<200||width/height<0.35||width/height>3)throw new Error("unusable dimensions");
          Object.assign(item,await fingerprintPhoto(bytes),{imageWidth:width,imageHeight:height});
        }catch{delete items[index].imageUrl;rejected++;}
      }}));
      // One identical image attached to many different dishes is a placeholder,
      // not proof of all those dishes. Keep the menu but withhold that image.
      const uses=new Map<string,number>();for(const item of items)if(item.contentHash)uses.set(item.contentHash,(uses.get(item.contentHash)??0)+1);
      for(const item of items)if(item.contentHash&&(uses.get(item.contentHash)??0)>3){delete item.imageUrl;rejected++;}
      await db.query("begin isolation level repeatable read read only");
      const tables:Record<string,unknown>={};
      for(const table of ["menu_items","photos"])tables[table]=(await db.query(`select * from ${table} where restaurant_id=$1`,[placeId])).rows;
      tables.source_snapshots=(await db.query("select * from source_snapshots where entity_id=$1",[group.entityId])).rows;
      tables.canonical_dishes=(await db.query("select * from canonical_dishes where entity_id=$1",[group.entityId])).rows;
      tables.restaurants=(await db.query("select * from restaurants where place_id=$1",[placeId])).rows;
      tables.brand_menu_templates=(await db.query("select * from brand_menu_templates where brand_id in (select brand_id from restaurant_brand_memberships where entity_id=$1)",[group.entityId])).rows;
      await db.query("rollback");
      writeFileSync(backup,JSON.stringify({at:new Date().toISOString(),placeId,entityId:group.entityId,source,identityEvidence:group.identityEvidence,tables},null,2),{flag:"wx"});
      const snapshot=await persistSourceMenuItems(placeId,source,items,{partial:true});
      if(!snapshot)throw new Error(`Publication failed: ${group.name}`);
      const after=(await db.query("select count(*)::int total,count(*) filter(where active and is_orderable and dedupe_reason is null)::int useful from photos where restaurant_id=$1",[placeId])).rows[0];
      const result={name:group.name,entityId:group.entityId,placeId,source,snapshot,items:items.length,verifiedPhotoCandidates:items.filter(i=>i.imageUrl).length,rejected,after,at:new Date().toISOString()};
      writeFileSync(journal,JSON.stringify(result,null,2),{flag:"wx"});console.log(JSON.stringify(result));
    }
  }finally{await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
