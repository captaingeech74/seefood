#!/usr/bin/env -S npx tsx
/** Read-only deterministic audit of entities where durable website extraction missed. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { crawlWebsiteV3, type WebsiteV3Target } from "../src/crawler/websiteV3";
import { ensurePythonEnv } from "../src/crawler/pythonFetch";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string,fallback:string){const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:fallback;}

async function main(){
  loadEnv();
  const limit=Math.min(366,Math.max(1,Number(argument("limit","60"))));
  const concurrency=Math.min(8,Math.max(1,Number(argument("concurrency","6"))));
  const render=argument("render","true")!=="false";
  if(render){const python=ensurePythonEnv();if(!python.ready)throw new Error(`Browser environment unavailable: ${python.reason}`);}
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-readonly-website-recovery-audit"});
  await db.connect();await db.query("begin transaction read only");
  const rows=(await db.query(
    `with successful as (select distinct entity_id from website_menu_observations where active),
      candidates as (select w.*,e.name,row_number() over(partition by w.entity_id order by case w.source when 'google' then 0 when 'overture' then 1 else 2 end,w.updated_at desc,w.id) rank
       from restaurant_websites w join acquisition_market_entities m on m.entity_id=w.entity_id and m.market_key='temecula-ca' and m.active
       join restaurant_entities e on e.id=w.entity_id left join successful s on s.entity_id=w.entity_id where w.active and s.entity_id is null)
     select * from candidates where rank=1 order by md5(entity_id::text||'website-v31-audit') limit $1`,[limit])).rows;
  await db.query("rollback");await db.end();
  let cursor=0;const results:any[]=[];
  async function worker(){while(cursor<rows.length){const row=rows[cursor++];const target:WebsiteV3Target={websiteId:row.id,entityId:row.entity_id,jobId:row.id,leaseToken:row.id,url:row.url,domain:row.domain,restaurantName:row.name,attempts:1};const result=await crawlWebsiteV3(target,{renderEnabled:render,maxPages:8});results.push({name:row.name,url:row.url,status:result.status,items:result.items.length,pdfs:result.pdfUrls.length,menuImages:result.menuImageUrls.length,pages:result.pages.length,methods:result.methods,error:result.error});console.log(JSON.stringify(results.at(-1)));}}
  await Promise.all(Array.from({length:Math.min(concurrency,rows.length)},()=>worker()));
  const recovered=results.filter(result=>result.items>0||result.pdfs>0||result.menuImages>0);
  console.log(JSON.stringify({audited:results.length,recoveredRestaurants:recovered.length,directItemRestaurants:results.filter(result=>result.items>0).length,pdfRestaurants:results.filter(result=>result.pdfs>0).length,menuImageRestaurants:results.filter(result=>result.menuImages>0).length,rawItems:results.reduce((sum,result)=>sum+result.items,0)},null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
