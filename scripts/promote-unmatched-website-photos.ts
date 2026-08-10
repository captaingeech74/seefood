#!/usr/bin/env -S npx tsx
/**
 * Promote a tiny, conservative subset of official-site named food photos that
 * do not confidently match a current menu item. Preview is the default.
 */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { DishPhoto } from "../src/lib/types";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string,fallback?:string){const index=process.argv.indexOf(`--${name}`);if(index<0)return fallback;const next=process.argv[index+1];return !next||next.startsWith("--")?"true":next;}
function normalize(value:string){return value.toLowerCase().normalize("NFKD").replace(/\p{M}/gu,"").replace(/[^a-z0-9]+/g," ").trim();}
function identityScore(name:string,domain:string){const domainKey=normalize(domain.replace(/^www\./,"").replace(/\.(?:com|net|org|co|us)$/i,"")).replace(/ /g,"");return normalize(name).split(" ").filter(token=>token.length>=3&&!/^(?:restaurant|kitchen|the)$/.test(token)&&domainKey.includes(token)).length;}
const GENERIC=new Set(["and","with","from","the","food","dish","plate","photo","image","gallery","restaurant","special","menu","copy","final"]);
const NON_FOOD=/(?:^|\b)(?:apparel|bar|bartender|banner|beer|brewery|building|cocktails?|dining room|drinks?|event|exterior|facebook|front|hoodies?|instagram|interior|logo|merch(?:andise)?|outdoor seating|people|reservation|seating|shirts?|soda|social|staff|storefront|team|tees?|tiktok|twitter|uniform|water|wine)(?:\b|$)/i;
const STRONG_PAGE=/(?:^|[\/_-])(?:food|dishes|cuisine|menu|brunch|breakfast|lunch|dinner|eat)(?:[\/_-]|$)/i;
const GALLERY_PAGE=/(?:^|[\/_-])(?:galler(?:y|ies)|photos?)(?:[\/_-]|$)/i;
const FOOD_WORD=/(?:^|\b)(?:bacon|beef|bowl|bread|breakfast|burger|burrito|cake|chicken|chile|curry|dessert|dumpling|egg|fries|kabob|kebab|lamb|lobster|musubi|noodles?|pasta|pizza|pork|ramen|rice|salad|salmon|sandwich|shrimp|smoothie|soup|steak|sushi|taco|toast|tuna|waffle|wings?)(?:\b|$)/i;
const BAD_LABEL=/(?:^|\b)(?:aquafina|frame|header|image|img|lto|map|mv2)(?:\b|$)|picture of .*menu|\b[a-z0-9]{12,}\b|\b\d{3,}\b/i;
const CATEGORY_ONLY=/^(?:(?:small|medium|large|11 inch|fast fire d)\s+)?(?:pizzas?|desserts?|entrees?|appetizers?|drinks?|favorites?|sides?)$/i;

type Candidate={entity_id:string;place_id:string;restaurant_name:string;domain:string;asset_url:string;page_url:string;label:string;content_sha256:string;byte_count:number;existing_photo_count:number;menu_names:string[]};

async function main(){
  loadEnv();const runId=argument("run-id");if(!runId)throw new Error("Usage: npm run acquisition:promote-unmatched-photos -- --run-id UUID [--publish]");
  const publish=argument("publish")==="true",maxPerRestaurant=Math.min(3,Math.max(1,Number(argument("max-per-restaurant","2"))));
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-unmatched-official-photo-promotion"});
  await db.connect();
  const rows=(await db.query(
    `select distinct on(r.place_id,ar.content_sha256) a.entity_id,r.place_id,e.name restaurant_name,w.domain,a.asset_url,a.page_url,
      a.metadata->>'namedFoodLabel' label,ar.content_sha256,ar.byte_count,
      (select count(*)::int from photos p where p.restaurant_id=r.place_id and p.active and p.is_orderable and not p.is_storefront) existing_photo_count,
      array(select mi.name from menu_items mi where mi.restaurant_id=r.place_id and mi.active order by mi.id limit 500) menu_names
     from website_assets a
     join website_asset_results ar on ar.run_id=$1 and ar.entity_id=a.entity_id and ar.asset_url=a.asset_url and ar.status='completed' and ar.kind='image'
     join restaurant_entities e on e.id=a.entity_id
     join restaurant_websites w on w.id=ar.website_id
     join restaurants r on r.entity_id=a.entity_id and r.status<>'test_fixture'
     where a.metadata->>'runId'=$1::text and a.metadata->>'namedPhotoCandidate'='true'
       and a.metadata->>'verificationStatus'='byte_verified' and a.metadata->>'namedMatchStatus'='unmatched'
       and w.domain!~* '\.ca$'
       and ar.content_sha256 is not null
     order by r.place_id,ar.content_sha256,a.page_url,a.asset_url`,[runId]
  )).rows as Candidate[];
  const domains=[...new Set(rows.map(row=>row.domain.toLowerCase()))];
  const siblingRows=domains.length?(await db.query(`select lower(w.domain) domain,array_agg(distinct e.name) names from restaurant_websites w join restaurant_entities e on e.id=w.entity_id where w.active and lower(w.domain)=any($1::text[]) group by lower(w.domain)`,[domains])).rows:[];
  const siblingsByDomain=new Map<string,string[]>(siblingRows.map(row=>[row.domain,row.names]));
  const foreignRouteEntities=new Set<string>((await db.query(
    `select cr.entity_id from website_crawl_v3_results cr where cr.run_id=$1
       and (select count(distinct coalesce(p->>'finalUrl',p->>'requestedUrl')) from jsonb_array_elements(coalesce(cr.route_evidence->'pages','[]'::jsonb)) p
            where coalesce(p->>'finalUrl',p->>'requestedUrl','') ~* '/(?:[a-z]+-)+menu(?:/|$)|/[a-z]{4,}menu(?:/|$)')>=2
       and not exists(select 1 from acquisition_market_entities m where m.entity_id=cr.entity_id and m.active and cr.route_evidence::text ilike '%'||regexp_replace(m.market_key,'-[a-z]{2}$','')||'%')`,[runId]
  )).rows.map(row=>row.entity_id));
  const qualified=rows.filter(row=>{
    const label=normalize(row.label??""),tokens=label.split(" ").filter(token=>token&&!GENERIC.has(token));
    const restaurantTokens=new Set(normalize(row.restaurant_name).split(" ").filter(token=>token.length>=3));
    const beyondBrand=tokens.filter(token=>!restaurantTokens.has(token)&&!/^\d+$/.test(token));
    if(label.length<4||label.length>70||tokens.length<1||tokens.length>8||!beyondBrand.length||NON_FOOD.test(label)||BAD_LABEL.test(label)||CATEGORY_ONLY.test(label)||Number(row.byte_count)<20_000)return false;
    const ownScore=identityScore(row.restaurant_name,row.domain),bestSibling=Math.max(...(siblingsByDomain.get(row.domain.toLowerCase())??[]).map(name=>identityScore(name,row.domain)),ownScore);if(ownScore<bestSibling||foreignRouteEntities.has(row.entity_id))return false;
    let path="";try{path=decodeURIComponent(new URL(row.page_url).pathname);}catch{return false;}
    if(/(?:^|[\/_-])(?:archive|old)(?:[\/_-]|$)/i.test(path))return false;
    const menuTokens=new Set((row.menu_names??[]).flatMap(name=>normalize(name).split(" ")).filter(token=>token.length>=4&&!GENERIC.has(token)));
    const menuEvidence=tokens.some(token=>menuTokens.has(token));
    if(STRONG_PAGE.test(path))return menuEvidence||FOOD_WORD.test(label);
    return GALLERY_PAGE.test(path)&&menuEvidence;
  }).sort((left,right)=>left.existing_photo_count-right.existing_photo_count||left.restaurant_name.localeCompare(right.restaurant_name)||left.label.localeCompare(right.label));
  const selected:Candidate[]=[];const counts=new Map<string,number>(),seenLabels=new Set<string>();
  for(const row of qualified){if(row.existing_photo_count>=3)continue;const count=counts.get(row.place_id)??0,labelKey=`${row.place_id}|${normalize(row.label)}`;if(count>=maxPerRestaurant||seenLabels.has(labelKey))continue;selected.push(row);counts.set(row.place_id,count+1);seenLabels.add(labelKey);}
  const summary={runId,mode:publish?"publish":"preview",reviewed:rows.length,qualified:qualified.length,selected:selected.length,restaurantsSelected:counts.size,
    restaurantsReceivingFirstPhoto:new Set(selected.filter(row=>row.existing_photo_count===0).map(row=>row.place_id)).size,samples:selected.slice(0,30).map(row=>({restaurant:row.restaurant_name,label:row.label,page:row.page_url,assetUrl:row.asset_url,existingPhotos:row.existing_photo_count}))};
  if(!publish){await db.end();console.log(JSON.stringify(summary,null,2));return;}
  const {persistSourcePhotos}=await import("../src/lib/db");let published=0,rejected=0;
  for(const row of selected){
    try{
      const response=await fetch(row.asset_url,{headers:{accept:"image/*"},signal:AbortSignal.timeout(20_000)});if(!response.ok||!isImageContentType(response.headers.get("content-type"))){rejected++;continue;}
      const bytes=Buffer.from(await response.arrayBuffer());const metadata=await sharp(bytes,{failOn:"error"}).metadata();
      const width=metadata.width??0,height=metadata.height??0,ratio=height?width/height:0;if(width<320||height<240||ratio<0.5||ratio>2.2){rejected++;continue;}
      const hashes=await fingerprintPhoto(bytes);if(hashes.contentHash!==row.content_sha256){rejected++;continue;}
      // The nearby filename/alt text is evidence that this is food, but it is
      // not reliable enough to name the dish. Keep the useful official photo
      // as an honest restaurant-level image instead of inventing a menu claim.
      const photo:DishPhoto={id:`common_crawl-${row.content_sha256}`,url:row.asset_url,dishName:null,dishDescription:null,isMenuMatch:false,
        source:"common_crawl",attribution:"owner",tier:3,width,height,loveCount:0,primaryVotes:0,photoAuthorType:"management",trustLabel:"management_photo",
        photoQualityScore:62,isHeroCandidate:false,isStorefront:false,isMenuPhoto:false,contentHash:hashes.contentHash,perceptualHash:hashes.perceptualHash};
      await persistSourcePhotos(row.place_id,"common_crawl",[photo]);published++;
    }catch{rejected++;}
  }
  await db.end();console.log(JSON.stringify({...summary,published,rejected},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
