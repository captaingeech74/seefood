#!/usr/bin/env -S npx tsx
/**
 * Attach byte-verified official-site photos only to menu items that already
 * exist for the restaurant. This is deliberately a photo backfill: it does
 * not create or retire menu items. Preview is the default.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { DataSource, DishPhoto } from "../src/lib/types";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string,fallback?:string){const index=process.argv.indexOf(`--${name}`);if(index<0)return fallback;const next=process.argv[index+1];return !next||next.startsWith("--")?"true":next;}
function normalize(value:string){return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();}
function identityScore(name:string,domain:string){const domainKey=normalize(domain.replace(/^www\./,"").replace(/\.(?:com|net|org|co|us)$/i,"")).replace(/ /g,"");return normalize(name).split(" ").filter(token=>token.length>=3&&!/^(?:restaurant|kitchen|the)$/.test(token)&&domainKey.includes(token)).length;}
const SOURCES=new Set<DataSource>(["schema_org","menufy","toast","square","clover","chownow","olo","popmenu","bentobox","owner","spothopper","slice","flipdish","lightspeed","gloriafood","menu_ocr"]);
function safeSource(value:string):DataSource{return SOURCES.has(value as DataSource)?value as DataSource:"schema_org";}

type Observation={entity_id:string;place_id:string;restaurant_name:string;domain:string;source_key:string;item_name:string;image_url:string;content_sha256:string;byte_count:number};
type MenuRow={id:number;restaurant_id:string;name:string};
type Prepared=Observation&{menuItemId:number;menuItemName:string};

async function main(){
  loadEnv();const runId=argument("run-id");if(!runId)throw new Error("Usage: npm run acquisition:promote-matched-photos -- --run-id UUID [--publish]");
  const publish=argument("publish")==="true";
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-matched-official-photo-promotion"});
  await db.connect();
  const observations=(await db.query(
    `select distinct on(r.place_id,a.metadata->>'matchedMenuName')
       a.entity_id,r.place_id,e.name restaurant_name,w.domain,
       'schema_org'::text source_key,
       a.metadata->>'matchedMenuName' item_name,a.asset_url image_url,
       ar.content_sha256,ar.byte_count
     from website_assets a
     join restaurants r on r.entity_id=a.entity_id and r.status<>'test_fixture'
     join restaurant_entities e on e.id=a.entity_id
     join website_asset_results ar on ar.run_id=$1 and ar.entity_id=a.entity_id
       and ar.asset_url=a.asset_url and ar.status='completed' and ar.kind='image'
     join restaurant_websites w on w.id=ar.website_id
     where a.metadata->>'runId'=$1::text
       and a.metadata->>'namedMatchStatus'='matched'
       and (a.metadata->>'matchScore')::int=100
       and a.metadata->>'matchedMenuName' is not null
       and a.metadata->>'matchedMenuName'!~* '(beer|bellini|coke|freeze|jarritos|juice|lemonade|olive oil|online order|order online|menu|hours|contact|reservation|soda|tea|water)'
       and w.domain!~* '\.ca$'
       and ar.content_sha256 is not null and ar.byte_count>=20000
     order by r.place_id,a.metadata->>'matchedMenuName',ar.byte_count desc,a.asset_url`,[runId]
  )).rows as Observation[];
  const domains=[...new Set(observations.map(row=>row.domain.toLowerCase()))];
  const siblingRows=domains.length?(await db.query(`select lower(w.domain) domain,array_agg(distinct e.name) names from restaurant_websites w join restaurant_entities e on e.id=w.entity_id where w.active and lower(w.domain)=any($1::text[]) group by lower(w.domain)`,[domains])).rows:[];
  const siblingsByDomain=new Map<string,string[]>(siblingRows.map(row=>[row.domain,row.names]));
  const foreignRouteEntities=new Set<string>((await db.query(
    `select cr.entity_id from website_crawl_v3_results cr where cr.run_id=$1
       and (select count(distinct coalesce(p->>'finalUrl',p->>'requestedUrl')) from jsonb_array_elements(coalesce(cr.route_evidence->'pages','[]'::jsonb)) p
            where coalesce(p->>'finalUrl',p->>'requestedUrl','') ~* '/(?:[a-z]+-)+menu(?:/|$)|/[a-z]{4,}menu(?:/|$)')>=2
       and not exists(select 1 from acquisition_market_entities m where m.entity_id=cr.entity_id and m.active and cr.route_evidence::text ilike '%'||regexp_replace(m.market_key,'-[a-z]{2}$','')||'%')`,[runId]
  )).rows.map(row=>row.entity_id));
  const placeIds=[...new Set(observations.map(row=>row.place_id))];
  const menuRows=placeIds.length?(await db.query(
    `select id,restaurant_id,name from menu_items where active and restaurant_id=any($1::text[])`,[placeIds]
  )).rows as MenuRow[]:[];
  const menuByPlace=new Map<string,Map<string,MenuRow>>();
  for(const row of menuRows){const map=menuByPlace.get(row.restaurant_id)??new Map<string,MenuRow>();if(!map.has(normalize(row.name)))map.set(normalize(row.name),row);menuByPlace.set(row.restaurant_id,map);}
  const prepared:Prepared[]=[];
  const seen=new Set<string>();
  for(const row of observations){
    const ownScore=identityScore(row.restaurant_name,row.domain),bestSibling=Math.max(...(siblingsByDomain.get(row.domain.toLowerCase())??[]).map(name=>identityScore(name,row.domain)),ownScore);
    if(ownScore<bestSibling||foreignRouteEntities.has(row.entity_id))continue;
    const item=menuByPlace.get(row.place_id)?.get(normalize(row.item_name));if(!item)continue;const key=`${row.place_id}|${item.id}|${row.content_sha256}`;if(seen.has(key))continue;seen.add(key);prepared.push({...row,menuItemId:Number(item.id),menuItemName:item.name});
  }
  const summary={runId,mode:publish?"publish":"preview",reviewedObservations:observations.length,exactCurrentMenuMatches:prepared.length,
    restaurantsSelected:new Set(prepared.map(row=>row.place_id)).size,uniqueImageBytes:new Set(prepared.map(row=>row.content_sha256)).size,
    samples:prepared.slice(0,30).map(row=>({restaurant:row.restaurant_name,dish:row.menuItemName,source:row.source_key,url:row.image_url}))};
  if(!publish){await db.end();console.log(JSON.stringify(summary,null,2));return;}

  const verified:Array<Prepared&{photo:DishPhoto}>=[];let rejected=0,cursor=0;
  async function worker(){while(cursor<prepared.length){const row=prepared[cursor++];try{
    const response=await fetch(row.image_url,{headers:{accept:"image/*"},signal:AbortSignal.timeout(20_000)});
    if(!response.ok||!isImageContentType(response.headers.get("content-type"))){rejected++;continue;}
    const bytes=Buffer.from(await response.arrayBuffer());const metadata=await sharp(bytes,{failOn:"error"}).metadata();
    const width=metadata.width??0,height=metadata.height??0,ratio=height?width/height:0;if(width<240||height<240||ratio<0.45||ratio>2.5){rejected++;continue;}
    const hashes=await fingerprintPhoto(bytes);if(hashes.contentHash!==row.content_sha256){rejected++;continue;}
    verified.push({...row,photo:{id:`website-${hashes.contentHash}-${row.menuItemId}`,url:row.image_url,dishName:row.menuItemName,dishDescription:null,menuItemId:row.menuItemId,
      isMenuMatch:true,source:safeSource(row.source_key),attribution:"owner",tier:1,width,height,loveCount:0,primaryVotes:0,photoAuthorType:"management",
      trustLabel:"management_photo",photoQualityScore:78,isHeroCandidate:true,isStorefront:false,isMenuPhoto:false,contentHash:hashes.contentHash,perceptualHash:hashes.perceptualHash}});
  }catch{rejected++;}}}
  await Promise.all(Array.from({length:Math.min(8,prepared.length)},()=>worker()));
  const groups=new Map<string,{placeId:string;source:DataSource;photos:DishPhoto[]}>();
  for(const row of verified){const source=safeSource(row.source_key),key=`${row.place_id}|${source}`;const group=groups.get(key)??{placeId:row.place_id,source,photos:[]};group.photos.push(row.photo);groups.set(key,group);}
  const {persistSourcePhotos}=await import("../src/lib/db");let snapshots=0;
  for(const group of groups.values())if(await persistSourcePhotos(group.placeId,group.source,group.photos))snapshots++;
  await db.end();console.log(JSON.stringify({...summary,byteVerified:verified.length,rejected,publishedSnapshots:snapshots},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
