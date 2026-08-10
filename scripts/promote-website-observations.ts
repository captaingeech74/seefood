#!/usr/bin/env -S npx tsx
/** Reconcile staged website observations; publication requires --publish. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import type { DataSource, MenuItemData } from "../src/lib/types";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string,fallback?:string){const index=process.argv.indexOf(`--${name}`);if(index<0)return fallback;const next=process.argv[index+1];return !next||next.startsWith("--")?"true":next;}
function normalize(value:string){return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();}

const SOURCES=new Set<DataSource>(["schema_org","menufy","toast","square","clover","chownow","olo","popmenu","bentobox","owner","spothopper","slice","flipdish","lightspeed","gloriafood","menu_ocr"]);
function safeSource(value:string):DataSource{return SOURCES.has(value as DataSource)?value as DataSource:"schema_org";}

async function main(){
  loadEnv();
  const market=argument("market");if(!market)throw new Error("Usage: npm run acquisition:promote-websites -- --market temecula-ca [--limit 100] [--publish]");
  const limit=Math.min(1000,Math.max(1,Number(argument("limit","100"))));
  const publish=argument("publish")==="true";
  const runId=argument("run-id")??null;
  const entityIdsArgument=argument("entity-ids");
  const selectedEntityIds=entityIdsArgument?entityIdsArgument.split(",").map(value=>value.trim()).filter(Boolean):null;
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const connectionString=process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password);
  const db=new pg.Client({connectionString,ssl:{rejectUnauthorized:false},application_name:"seefood-website-reconciliation"});
  await db.connect();
  const rows=(await db.query(
    `select o.entity_id,r.place_id,o.source_key,
      jsonb_agg(jsonb_build_object('name',o.item_name,'description',o.item_description,'imageUrl',o.image_url,'price',o.price) order by o.confidence desc,o.last_seen_at desc) items
     from website_menu_observations o
     join restaurants r on r.entity_id=o.entity_id and r.status<>'test_fixture'
     where o.active and o.confidence>=0.78
       and ($1='product-corpus-us' or exists(select 1 from acquisition_market_entities m where m.entity_id=o.entity_id and m.market_key=$1 and m.active))
       and ($3::uuid is null or o.last_v3_run_id=$3)
       and ($4::uuid[] is null or o.entity_id=any($4::uuid[]))
       and o.item_name!~* '^(extra|add|substitute|choice of)(?:$|[^a-z])'
       and o.item_name!~* '^(?:only|checkout|standard\+?|\([0-9]+ items?\)|[0-9]+ oz\.?|medium|small|large)$'
       and o.item_name!~ '[.·…]{2,}[[:space:]]*[0-9]'
       and o.item_name!~* '(?:shirts?|hoodies?|gift cards?)$'
       and not exists (select 1 from website_menu_observations suspect where suspect.entity_id=o.entity_id and suspect.active
         and suspect.last_v3_run_id=o.last_v3_run_id and suspect.extraction_method like '%network_json' and suspect.price>=500)
     group by o.entity_id,r.place_id,o.source_key order by count(*) desc limit $2`,[market,limit,runId,selectedEntityIds])).rows;
  const entityIds=[...new Set(rows.map(row=>row.entity_id))];
  const existing=entityIds.length?(await db.query(`select entity_id,normalized_name from canonical_dishes where entity_id=any($1::uuid[]) and active`,[entityIds])).rows:[];
  await db.end();
  const existingByEntity=new Map<string,Set<string>>();
  for(const row of existing){const set=existingByEntity.get(row.entity_id)??new Set<string>();set.add(row.normalized_name);existingByEntity.set(row.entity_id,set);}

  const stats={mode:publish?"publish":"preview",groups:rows.length,entities:entityIds.length,stagedItems:0,newCanonicalCandidates:0,alreadyKnown:0,
    photoCandidates:0,byteVerifiedPhotos:0,rejectedPhotoUrls:0,publishedGroups:0,publishedItems:0};
  const prepared:Array<{row:any;items:MenuItemData[]}>=[];
  for(const row of rows){
    const deduped=new Map<string,MenuItemData>();
    for(const item of row.items as MenuItemData[]){const key=normalize(item.name);if(!key)continue;const current=deduped.get(key);if(!current||Number(Boolean(item.description))+Number(Boolean(item.imageUrl))*2>Number(Boolean(current.description))+Number(Boolean(current.imageUrl))*2)deduped.set(key,item);}
    const items=[...deduped.values()];stats.stagedItems+=items.length;
    const known=existingByEntity.get(row.entity_id)??new Set<string>();
    for(const item of items){if(item.imageUrl)stats.photoCandidates++;if(known.has(normalize(item.name)))stats.alreadyKnown++;else stats.newCanonicalCandidates++;}
    prepared.push({row,items});
  }
  if(!publish){console.log(JSON.stringify({market,runId,selectedEntityCount:selectedEntityIds?.length??null,...stats,note:"Preview only. Re-run with --publish after review."},null,2));return;}

  const {persistSourceMenuItems}=await import("../src/lib/db");
  const {fingerprintPhoto,isImageContentType}=await import("../src/lib/photoFingerprint");
  for(const {row,items} of prepared){
    let cursor=0;
    async function worker(){while(cursor<items.length){const index=cursor++,item=items[index];if(!item.imageUrl)continue;
      try{const response=await fetch(item.imageUrl,{headers:{accept:"image/*"},signal:AbortSignal.timeout(15_000)});
        if(!response.ok||!isImageContentType(response.headers.get("content-type"))){items[index]={...item,imageUrl:undefined};stats.rejectedPhotoUrls++;continue;}
        const bytes=Buffer.from(await response.arrayBuffer());if(!bytes.length||bytes.length>20*1024*1024){items[index]={...item,imageUrl:undefined};stats.rejectedPhotoUrls++;continue;}
        const hashes=await fingerprintPhoto(bytes);items[index]={...item,...hashes};stats.byteVerifiedPhotos++;
      }catch{items[index]={...item,imageUrl:undefined};stats.rejectedPhotoUrls++;}}
    }
    await Promise.all(Array.from({length:Math.min(8,items.length)},()=>worker()));
    const snapshot=await persistSourceMenuItems(row.place_id,safeSource(row.source_key),items);
    if(snapshot){stats.publishedGroups++;stats.publishedItems+=items.length;}
  }
  console.log(JSON.stringify({market,runId,selectedEntityCount:selectedEntityIds?.length??null,...stats},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
