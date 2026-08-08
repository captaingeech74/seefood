#!/usr/bin/env -S npx tsx
/** Preview or reversibly quarantine website observations that escaped their restaurant/source boundary. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { isTrustedCrawlUrl } from "../src/crawler/websiteV3";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string){const index=process.argv.indexOf(`--${name}`);if(index<0)return undefined;const next=process.argv[index+1];return !next||next.startsWith("--")?"true":next;}

async function main(){
  loadEnv();const runId=argument("run-id");if(!runId)throw new Error("Usage: npx tsx scripts/quarantine-website-observations.ts --run-id UUID [--publish]");
  const publish=argument("publish")==="true",password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-website-evidence-quarantine"});
  await db.connect();const rows=(await db.query(`select o.id,o.entity_id,o.item_name,o.evidence_url,o.extraction_method,o.active,w.url root_url,e.name restaurant_name from website_menu_observations o join restaurant_websites w on w.id=o.website_id join restaurant_entities e on e.id=o.entity_id where o.last_v3_run_id=$1 and o.active`,[runId])).rows;
  const rejected=rows.filter(row=>row.extraction_method!=="paddleocr_vl"&&row.extraction_method!=="pdf_text"&&(!row.evidence_url||!isTrustedCrawlUrl(row.evidence_url,row.root_url,row.restaurant_name)));
  const groups=new Map<string,{restaurant:string;host:string;rows:number}>();for(const row of rejected){let host="invalid";try{host=new URL(row.evidence_url).hostname;}catch{}const key=`${row.entity_id}|${host}`,current=groups.get(key)??{restaurant:row.restaurant_name,host,rows:0};current.rows++;groups.set(key,current);}
  const summary={runId,mode:publish?"publish":"preview",observationsReviewed:rows.length,observationsRejected:rejected.length,restaurantsAffected:new Set(rejected.map(row=>row.entity_id)).size,rejectedGroups:[...groups.values()].sort((a,b)=>b.rows-a.rows),samples:rejected.slice(0,12).map(row=>({restaurant:row.restaurant_name,item:row.item_name,evidenceUrl:row.evidence_url,rootUrl:row.root_url}))};
  if(publish&&rejected.length){await db.query("begin");try{for(const row of rejected){await db.query(`insert into website_observation_quarantine_log(observation_id,crawl_run_id,reason,evidence_url,root_url,previous_active) values($1,$2,'untrusted_cross_domain_evidence',$3,$4,$5) on conflict(observation_id,reason) do nothing`,[row.id,runId,row.evidence_url,row.root_url,row.active]);}await db.query(`update website_menu_observations set active=false where id=any($1::bigint[])`,[rejected.map(row=>row.id)]);await db.query("commit");}catch(error){await db.query("rollback");throw error;}}
  await db.end();console.log(JSON.stringify(summary,null,2));
}
main().catch(error=>{console.error(error);process.exitCode=1;});
