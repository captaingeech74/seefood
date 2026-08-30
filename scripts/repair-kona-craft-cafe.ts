#!/usr/bin/env -S npx tsx

/** Idempotently publish Kona Craft Cafe from its official menu and social account. */
import { existsSync, readFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import pg from "pg";
import sharp from "sharp";
import { fingerprintPhoto, isImageContentType } from "../src/lib/photoFingerprint";
import type { DishPhoto, MenuItemData } from "../src/lib/types";

const ENTITY_ID="e9dfcfc6-9a56-41d3-b279-6990fff60e96";
const PLACE_ID=`seefood:${ENTITY_ID}`;
const WEBSITE="https://konacraft.com/";
const ADDRESS="3001 Carlsbad Boulevard, Carlsbad, CA 92008";

const MENU:MenuItemData[]=[
  ["Cheddar Rosemary Biscuits","House country gravy"],
  ["Coco's Loco Poutine","Sidewinder fries, kalua pork, bacon, gravy, sunny eggs, cheddar, pickled vegetables, and cilantro"],
  ["Ivy's Island Style Twinkies","Portuguese sausage dipped in corn batter with spicy mayo, pomegranate barbecue sauce, mango salsa, and cilantro"],
  ["Lemon Ricotta Beignets","Wild berry compote"],
  ["Musubi","Two pieces with housemade Spam"],
  ["Home on the Range Omelette","Applewood smoked ham, onions, mixed peppers, Jack, and cheddar"],
  ["Spanish Omelette","Blackened shrimp, Spanish peppers, pepper Jack, and pico de gallo"],
  ["Kona Omelette","Kalua pork, mixed peppers, pepper Jack, avocado, and mango salsa"],
  ["The Californian Omelette","Avocado, heirloom tomato, and Jack cheese"],
  ["Truffled Mushroom Omelette","Truffled mushroom blend, herbed cheese, chives, and arugula salad"],
  ["Greek Omelette","Spinach, tomatoes, artichokes, and feta"],
  ["State Street Omelette","Zucchini, bell peppers, broccoli, tomato, ricotta, basil, and arugula"],
  ["Traditional Benedict","Applewood smoked ham, English muffin, paprika, and chives"],
  ["Olivia Benny","Arugula, heirloom tomato, English muffin, and avocado"],
  ["Paniolo aka The Cowboy","Kalua pork, house biscuit, poblano, Cajun hollandaise, crispy onions, and barbecue sauce"],
  ["Crab Cake Benny","Crab meat, asparagus, English muffin, avocado, chives, and sauce choron"],
  ["Crisp Belgian Waffle"], ["Buttermilk Pancakes"],
  ["Brioche French Toast","Fresh berries or triple berry or peach compote"],
  ["Banana Fosters Pancakes","Caramelized bananas in a rum sauce"],
  ["Peaches n Cream Pancakes","Peach compote and house vanilla cream"],
  ["Island Style Pancakes","Coconut glaze, macadamias, toasted coconut, and pomegranate"],
  ["Lily's Stuffed French Toast","Lilikoi sauce, citrus whipped cream cheese, mango, and pomegranate"],
  ["Avocado Toast","Rosemary sourdough, avocado, arugula, heirloom tomato, pomegranate, and balsamic glaze"],
  ["Tuscan Toast","Rosemary sourdough, burrata, heirloom tomato, prosciutto, basil, arugula, balsamic glaze, and sunny egg"],
  ["Cured Salmon Toast","Rye bread, beet-cured salmon, lemon cream cheese, tomato, avocado, red onion, crispy capers, and dill"],
  ["Fresh Fruit Parfait","Greek vanilla yogurt, seasonal fruit, and granola"],
  ["Organic Oatmeal","Steel-cut oatmeal with cinnamon, milk, and brown sugar"],
  ["Acai Bowl","Acai, strawberries, blueberries, banana, mango, coconut, granola, and honey"],
  ["Dragon Beach Bowl","Pitaya and blue magic with banana, mango, pineapple, coconut, and bee pollen"],
  ["Loco Moco","Hamburger patties, rice, brown gravy, two eggs, furikake, microgreens, and chives"],
  ["Braddah Moco","Kalua pork, rice, brown gravy, two eggs, furikake, microgreens, and chives"],
  ["Da Big Moke","Housemade Spam, Portuguese sausage, two eggs, rice, brown gravy, furikake, microgreens, and chives"],
  ["Broke da Mouth Moco","Hamburger patty, Portuguese sausage, kalua pork, two eggs, rice, gravy, furikake, greens, and chives"],
  ["Two Eggs Breakfast"], ["The 2-2-2","Pancakes or French toast, two eggs, and bacon or sausage"],
  ["Big Island Burrito","Kalua pork, scrambled eggs, pepper Jack, peppers, scallions, avocado, and cilantro"],
  ["C-Bad Burrito","Applewood bacon, hashbrowns, eggs, mixed cheese, pico, and tomatillo salsa"],
  ["Barrio Burrito","Chorizo, eggs, Spanish peppers, house potatoes, and cotija"],
  ["Chilaquiles Verdes","Tortilla chips, tomatillo salsa, eggs, cotija, sour cream, avocado, and cilantro"],
  ["Egg, Cheese & Avocado Crepes","Hollandaise, fruit, and choice of potatoes"],
  ["Batiquitos Crepes","Eggs, goat cheese, Spanish peppers, arugula, and hollandaise"],
  ["Country Fried Steak","Breaded fried steak, country gravy, two eggs, and potatoes"],
  ["Breakfast Burger","Patty, bacon, sunny egg, cheddar, lettuce, tomato, and onion"],
  ["Breakfast Croissant Sandwich","Scrambled eggs, ham, Jack, and cheddar"],
  ["Hanger with the Homies","Hanger steak, two eggs, and potatoes"],
  ["New England Clam Chowder"], ["House TJ Caesar"], ["Strawberry Fields Salad"],
  ["Classic Cobb","Chicken, bacon, tomato, avocado, egg, blue cheese, and ranch"],
  ["Market Beet Salad","Beets, walnuts, apple, fennel, goat cheese, and citrus vinaigrette"],
  ["Asian Salad","Lettuce, soba noodles, mango, edamame, seaweed, peppers, scallions, wonton, and sesame"],
  ["101 Burger"], ["BBQ Burger"], ["Island Burger"], ["Truffle Mushroom Burger"], ["Turkey Burger"], ["Maryland Po' Boy"],
  ["BLT Classic"], ["French Dip"], ["Santa Fe Chicken"], ["Albacore Tuna Melt"], ["California Club"], ["Katsu Chicken Sandwich"],
  ["Bulgogi Lettuce Wraps"], ["Katsu Bowl"], ["Crispy Chicken Strips"], ["Baja Fish Tacos"],
  ["Kalua Pork Sliders"], ["Kalua Pork Quesadilla"], ["Chicken Quesadilla"], ["Fish & Chips"], ["Mixed Lunch Plate"],
].map(([name,description])=>({name,description}));

const PHOTOS=[
  {shortcode:"DY95repu6Ky",dish:"Kalua Pork Quesadilla",quality:91},
  {shortcode:"DYpxbUVPBCA",dish:"Braddah Moco",quality:92},
  {shortcode:"DYc35tqPl6B",dish:"California Club",quality:89},
  {shortcode:"DYZ2Bj-qe0M",dish:"Ivy's Island Style Twinkies",quality:87},
  {shortcode:"DXzG1Q6iuof",dish:"Cured Salmon Toast",quality:93},
  {shortcode:"DXj9NBzCsKw",dish:"Coco's Loco Poutine",quality:92},
] as const;

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function connectionString(){const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");const url=process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password);if(!url)throw new Error("DATABASE_URL is not configured");return url;}

async function officialPosts(){
  // Instagram rejects Node's TLS fingerprint intermittently but serves the
  // same public profile response to an ordinary browser-like curl request.
  const body=JSON.parse(execFileSync("curl",["-L","--fail","--max-time","30","-sS","https://www.instagram.com/api/v1/users/web_profile_info/?username=konacraftcarlsbad","-H","x-ig-app-id: 936619743392459","-H","User-Agent: Mozilla/5.0"],{encoding:"utf8",maxBuffer:2_000_000})) as any;
  const nodes=body?.data?.user?.edge_owner_to_timeline_media?.edges?.map((edge:any)=>edge.node)??[];
  return new Map(nodes.map((node:any)=>[node.shortcode,node]));
}

async function preparePhotos(upload:boolean):Promise<DishPhoto[]>{
  const copyPhotoToR2=upload?(await import("../src/lib/storage")).copyPhotoToR2:null;
  const posts=await officialPosts(),photos:DishPhoto[]=[];
  for(const candidate of PHOTOS){
    const post:any=posts.get(candidate.shortcode);if(!post?.display_url)throw new Error(`Missing official post ${candidate.shortcode}`);
    const response=await fetch(post.display_url,{headers:{accept:"image/*"},signal:AbortSignal.timeout(20_000)});
    if(!response.ok||!isImageContentType(response.headers.get("content-type")))throw new Error(`Invalid official photo ${candidate.shortcode}`);
    const bytes=Buffer.from(await response.arrayBuffer()),metadata=await sharp(bytes,{failOn:"error"}).metadata(),hashes=await fingerprintPhoto(bytes);
    if((metadata.width??0)<640||(metadata.height??0)<480)throw new Error(`Official photo too small ${candidate.shortcode}`);
    const storageUrl=(copyPhotoToR2?await copyPhotoToR2(post.display_url,`official-social/kona-craft-cafe/${candidate.shortcode}.jpg`):undefined)??undefined;
    if(upload&&!storageUrl)throw new Error(`R2 copy failed ${candidate.shortcode}`);
    photos.push({id:`kona-${candidate.shortcode}`,url:`https://www.instagram.com/p/${candidate.shortcode}/`,storageUrl,dishName:candidate.dish,dishDescription:null,isMenuMatch:true,source:"official_social",attribution:"owner",tier:1,width:metadata.width!,height:metadata.height!,loveCount:0,primaryVotes:0,photoAuthorType:"management",trustLabel:"management_photo",photoQualityScore:candidate.quality,isHeroCandidate:true,isStorefront:false,isMenuPhoto:false,contentHash:hashes.contentHash,perceptualHash:hashes.perceptualHash});
  }
  return photos;
}

async function main(){
  loadEnv();const apply=process.argv.includes("--apply"),rollback=process.argv.includes("--rollback");
  const db=new pg.Client({connectionString:connectionString(),ssl:{rejectUnauthorized:false}});await db.connect();
  try{
    if(rollback){await db.query("begin");await db.query("update restaurants set status='inactive',updated_at=now() where place_id=$1",[PLACE_ID]);await db.query("update restaurant_websites set active=false,updated_at=now() where entity_id=$1 and url=$2",[ENTITY_ID,WEBSITE]);await db.query("update restaurant_entities set status='identity_only',website=null,updated_at=now() where id=$1",[ENTITY_ID]);await db.query("update menu_items set active=false where restaurant_id=$1 and source_key=any($2::text[])",[PLACE_ID,["menu_ocr","official_social"]]);await db.query("update photos set active=false,is_orderable=false where restaurant_id=$1 and source='official_social'",[PLACE_ID]);await db.query("commit");console.log(JSON.stringify({mode:"rolled_back",placeId:PLACE_ID}));return;}
    const photos=await preparePhotos(apply);
    if(!apply){console.log(JSON.stringify({mode:"preview",placeId:PLACE_ID,menuItems:MENU.length,officialPhotos:photos.length,website:WEBSITE},null,2));return;}
    await db.query("begin");
    await db.query("update restaurant_entities set website=$2,status='active',backbone_state='published',updated_at=now() where id=$1",[ENTITY_ID,WEBSITE]);
    await db.query(`insert into restaurant_websites(entity_id,url,domain,source,active,updated_at) values($1,$2,'konacraft.com','founder_qa',true,now()) on conflict(entity_id,url) do update set active=true,source=excluded.source,updated_at=now()`,[ENTITY_ID,WEBSITE]);
    await db.query(`with refreshed as (update acquisition_market_entities set active=true,last_seen_at=now() where market_key='san-diego-metro-ca' and entity_id=$1 returning 1) insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active) select 'san-diego-metro-ca',$1,'founder_qa',now(),true where not exists(select 1 from refreshed)`,[ENTITY_ID]);
    await db.query(`insert into restaurants(place_id,slug,name,lat,lng,address,website,status,entity_id,updated_at) select $1,'kona-craft-cafe-carlsbad','Kona Craft Cafe',lat,lng,$2,$3,'active',id,now() from restaurant_entities where id=$4 on conflict(place_id) do update set name=excluded.name,lat=excluded.lat,lng=excluded.lng,address=excluded.address,website=excluded.website,status='active',entity_id=excluded.entity_id,updated_at=now()`,[PLACE_ID,ADDRESS,WEBSITE,ENTITY_ID]);
    await db.query("commit");
    const {persistSourceMenuItems,persistSourcePhotos}=await import("../src/lib/db");
    const menuSnapshot=await persistSourceMenuItems(PLACE_ID,"menu_ocr",MENU);
    const menuRows=(await db.query("select id,name from menu_items where restaurant_id=$1 and active",[PLACE_ID])).rows;
    const menuIds=new Map(menuRows.map(row=>[String(row.name).toLowerCase().replace(/[^a-z0-9]+/g," ").trim(),Number(row.id)]));
    const linkedPhotos=photos.map(photo=>({...photo,menuItemId:menuIds.get(photo.dishName!.toLowerCase().replace(/[^a-z0-9]+/g," ").trim())}));
    if(linkedPhotos.some(photo=>!photo.menuItemId))throw new Error("A selected official photo no longer matches the current menu");
    const photoSnapshot=await persistSourcePhotos(PLACE_ID,"official_social",linkedPhotos);
    if(!menuSnapshot||!photoSnapshot)throw new Error("Source persistence did not produce snapshots");
    await db.query("begin");
    for(const photo of linkedPhotos){
      const row=(await db.query(`update photos set menu_item_id=$2,gemini_label=$3,tier=1,is_orderable=true,active=true,last_seen_at=now() where restaurant_id=$1 and origin_url=$4 returning id`,[PLACE_ID,photo.menuItemId,photo.dishName,photo.url])).rows[0];
      if(!row)throw new Error(`Persisted photo missing for ${photo.dishName}`);
      await db.query(`insert into photo_menu_item_links(photo_id,menu_item_id,source) values($1,$2,'official_social') on conflict(photo_id,menu_item_id) do update set source=excluded.source`,[row.id,photo.menuItemId]);
    }
    await db.query("commit");
    const counts=(await db.query(`select (select count(*) from menu_items where restaurant_id=$1 and active) menu_items,(select count(*) from photos where restaurant_id=$1 and active and is_orderable) photos,(select count(distinct content_hash) from photos where restaurant_id=$1 and active and is_orderable) unique_photos`,[PLACE_ID])).rows[0];
    console.log(JSON.stringify({mode:"applied",placeId:PLACE_ID,menuSnapshot,photoSnapshot,...counts},null,2));
  }catch(error){try{await db.query("rollback");}catch{}throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
