#!/usr/bin/env -S npx tsx
/** Idempotently absorb the strongest completed V2 evidence into durable V3 staging. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";

function loadEnv(){const path=join(__dirname,"..",".env.local");if(!existsSync(path))throw new Error(`Missing ${path}`);for(const line of readFileSync(path,"utf8").split("\n")){const match=line.match(/^([A-Z0-9_]+)=(.*)$/);if(match&&!process.env[match[1]])process.env[match[1]]=match[2];}}
function argument(name:string,fallback?:string){const index=process.argv.indexOf(`--${name}`);return index>=0?process.argv[index+1]:fallback;}

async function main(){
  loadEnv();
  const market=argument("market");if(!market)throw new Error("Usage: npm run acquisition:merge-website-evidence -- --market temecula-ca [--v2-run UUID]");
  const password=encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??"");
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]",password),ssl:{rejectUnauthorized:false},application_name:"seefood-website-evidence-merge"});
  await db.connect();
  const requested=argument("v2-run")??argument("v2-run-id");
  const run=requested?{id:requested}:(await db.query(`select id from website_crawl_v2_runs where market_key=$1 and status='completed' order by completed_at desc nulls last,started_at desc limit 1`,[market])).rows[0];
  if(!run?.id)throw new Error(`No completed V2 run found for ${market}`);
  await db.query("begin");
  try{
    const before=Number((await db.query(`select count(*) count from website_menu_observations o join acquisition_market_entities m on m.entity_id=o.entity_id and m.market_key=$1 and m.active`,[market])).rows[0].count);
    await db.query(
      `insert into website_menu_observations(entity_id,website_id,source_key,item_name,item_description,image_url,price,item_fingerprint,active,last_seen_at,evidence_url,extraction_method,confidence,absent_successful_runs)
       select v.entity_id,v.website_id,v.source_key,v.item_name,v.item_description,v.image_url,v.price,v.item_fingerprint,true,now(),v.evidence_url,'v2:'||v.extraction_method,
         case when v.extraction_method='pdf_text' then least(v.confidence,0.7) when v.extraction_method='paddleocr_vl' then least(v.confidence,0.82) else v.confidence end,0
       from website_menu_v2_observations v
       join acquisition_market_entities m on m.entity_id=v.entity_id and m.market_key=$2 and m.active
       where v.run_id=$1
       on conflict(entity_id,source_key,item_fingerprint) do update set
         active=true,last_seen_at=greatest(website_menu_observations.last_seen_at,excluded.last_seen_at),
         evidence_url=coalesce(website_menu_observations.evidence_url,excluded.evidence_url),
         extraction_method=coalesce(website_menu_observations.extraction_method,excluded.extraction_method),
         confidence=greatest(website_menu_observations.confidence,excluded.confidence)`,
      [run.id,market]
    );
    await db.query(`update website_menu_observations o set confidence=case when extraction_method in ('pdf_text','v2:pdf_text') then least(confidence,0.7)
      when extraction_method in ('paddleocr_vl','v2:paddleocr_vl') then least(confidence,0.82) else confidence end
      from acquisition_market_entities m where m.entity_id=o.entity_id and m.market_key=$1 and m.active`,[market]);
    const after=Number((await db.query(`select count(*) count from website_menu_observations o join acquisition_market_entities m on m.entity_id=o.entity_id and m.market_key=$1 and m.active`,[market])).rows[0].count);
    await db.query("commit");
    console.log(JSON.stringify({market,v2RunId:run.id,beforeRows:before,afterRows:after,netNewRows:after-before},null,2));
  }catch(error){await db.query("rollback");throw error;}finally{await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
