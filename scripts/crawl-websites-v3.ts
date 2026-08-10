#!/usr/bin/env -S npx tsx
/** Unified, durable and evidence-preserving website acquisition V3 worker. */
import { BasicCrawler, log, RequestQueue } from "crawlee";
import { createHash } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { extractMenuImage, extractPdfMenu } from "../src/crawler/pdfMenu";
import { ensurePythonEnv } from "../src/crawler/pythonFetch";
import {
  crawlWebsiteV3,
  namedPhotoDishMatchScore,
  normalizeMenuItemName,
  type WebsiteV3Result,
  type WebsiteV3Target,
} from "../src/crawler/websiteV3";

type AssetJob = {
  id: string; run_id: string; entity_id: string; website_id: string; asset_url: string;
  kind: "pdf" | "image" | "menu_image"; menu_linked: boolean; attempts: number; lease_token: string;
};

function loadEnv() {
  const path = join(__dirname, "..", ".env.local");
  if (!existsSync(path)) throw new Error(`Missing ${path}`);
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2];
  }
}

function args() {
  const values: Record<string, string> = {};
  for (let index = 2; index < process.argv.length; index++) {
    if (!process.argv[index].startsWith("--")) continue;
    const key = process.argv[index].slice(2), next = process.argv[index + 1];
    values[key] = next && !next.startsWith("--") ? process.argv[++index] : "true";
  }
  return values;
}

function connectionString() {
  const password = encodeURIComponent(process.env.SUPABASE_DB_PASSWORD ?? "");
  const url = process.env.DATABASE_URL?.replace("[YOUR-PASSWORD]", password);
  if (!url) throw new Error("DATABASE_URL is not configured");
  return url;
}

function itemFingerprint(item: { name: string; description?: string; imageUrl?: string; price?: number }) {
  return createHash("sha256").update(JSON.stringify([
    normalizeMenuItemName(item.name), item.description?.trim() || null, item.price ?? null, item.imageUrl ?? null,
  ])).digest("hex");
}

async function persistWebsiteResult(pool: pg.Pool, runId: string, target: WebsiteV3Target, result: WebsiteV3Result, options:{photoBackfill?:boolean}={}) {
  const client = await pool.connect();
  try {
    await client.query("begin");
    await client.query(
      `insert into website_crawl_v3_results(run_id,crawl_job_id,entity_id,website_id,status,fetch_methods,platforms,page_count,item_count,generic_photo_candidate_count,menu_linked_photo_count,pdf_discovered_count,elapsed_ms,route_evidence,error_detail)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14::jsonb,$15)
       on conflict(run_id,website_id) do update set status=excluded.status,fetch_methods=excluded.fetch_methods,platforms=excluded.platforms,
       page_count=excluded.page_count,item_count=excluded.item_count,generic_photo_candidate_count=excluded.generic_photo_candidate_count,
       menu_linked_photo_count=excluded.menu_linked_photo_count,pdf_discovered_count=excluded.pdf_discovered_count,elapsed_ms=excluded.elapsed_ms,
       route_evidence=excluded.route_evidence,error_detail=excluded.error_detail`,
      [runId,target.jobId,target.entityId,target.websiteId,result.status,result.methods,result.platforms,result.pages.length,result.items.length,
       result.genericPhotos.length,result.linkedPhotos.length,result.pdfUrls.length,result.elapsedMs,
       JSON.stringify({ pages: result.pages, decisions: result.routeDecisions }),result.error?.slice(0,500) ?? null]
    );

    for (const evidence of result.items) {
      await client.query(
        `insert into website_menu_observations(entity_id,website_id,crawl_job_id,source_key,item_name,item_description,image_url,price,item_fingerprint,active,last_seen_at,evidence_url,extraction_method,confidence,last_v3_run_id,absent_successful_runs)
         values($1,$2,$3,$4,$5,$6,$7,$8,$9,true,now(),$10,$11,$12,$13,0)
         on conflict(entity_id,source_key,item_fingerprint) do update set
           active=true,last_seen_at=now(),website_id=excluded.website_id,crawl_job_id=excluded.crawl_job_id,
           evidence_url=excluded.evidence_url,extraction_method=excluded.extraction_method,
           confidence=greatest(website_menu_observations.confidence,excluded.confidence),last_v3_run_id=excluded.last_v3_run_id,absent_successful_runs=0`,
        [target.entityId,target.websiteId,target.jobId,evidence.sourceKey,evidence.item.name,evidence.item.description??null,
         evidence.item.imageUrl??null,evidence.item.price??null,evidence.fingerprint,evidence.evidenceUrl,evidence.method,evidence.confidence,runId]
      );
    }

    // A single crawl miss never deletes known-good data. Two successful,
    // source-comparable absences mark an observation stale and reversible.
    if (result.status === "completed" || result.status === "empty") {
      await client.query(
        `update website_menu_observations set absent_successful_runs=absent_successful_runs+1,
         active=case when absent_successful_runs+1>=2 then false else active end
         where entity_id=$1 and website_id=$2 and active
           and last_v3_run_id is distinct from $3::uuid`,
        [target.entityId,target.websiteId,runId]
      );
    }

    for (const url of [...new Set([...result.linkedPhotos, ...result.namedPhotos.map(photo=>photo.url), ...result.genericPhotos])].slice(0,160)) {
      const named=result.namedPhotos.find(photo=>photo.url===url);
      await client.query(
        `insert into website_assets(entity_id,website_id,page_url,asset_url,kind,source,metadata,active,last_seen_at)
         values($1,$2,$3,$4,'image','website_v3',$5::jsonb,true,now())
         on conflict(entity_id,asset_url) do update set website_id=excluded.website_id,page_url=excluded.page_url,
         source=excluded.source,metadata=excluded.metadata,active=true,last_seen_at=now()`,
        [target.entityId,target.websiteId,named?.evidenceUrl??target.url,url,JSON.stringify({runId,menuLinked:result.linkedPhotos.includes(url),verificationStatus:"pending",
          namedFoodLabel:named?.label??null,namedPhotoCandidate:Boolean(named)})]
      );
    }
    // Byte verification is immediately valuable for dish-linked images.
    // Generic page imagery remains staged for a later food-classification job
    // instead of consuming the market crawl's critical path.
    for (const url of [...new Set(result.linkedPhotos)].slice(0,160)) {
      await client.query(
        `insert into website_asset_jobs(run_id,entity_id,website_id,asset_url,kind,menu_linked)
         values($1,$2,$3,$4,'image',$5) on conflict(run_id,website_id,asset_url,kind) do update set menu_linked=excluded.menu_linked`,
        [runId,target.entityId,target.websiteId,url,true]
      );
    }
    // Explicitly labelled official gallery/food photos are bounded priority
    // assets. Byte verification happens before any label can reach product data.
    for (const photo of result.namedPhotos.filter(photo=>!result.linkedPhotos.includes(photo.url)).slice(0,80)) {
      await client.query(
        `insert into website_asset_jobs(run_id,entity_id,website_id,asset_url,kind,menu_linked)
         values($1,$2,$3,$4,'image',false) on conflict(run_id,website_id,asset_url,kind) do nothing`,
        [runId,target.entityId,target.websiteId,photo.url]
      );
    }
    for (const url of options.photoBackfill?[]:result.pdfUrls) {
      await client.query(
        `insert into website_asset_jobs(run_id,entity_id,website_id,asset_url,kind)
         values($1,$2,$3,$4,'pdf') on conflict(run_id,website_id,asset_url,kind) do nothing`,
        [runId,target.entityId,target.websiteId,url]
      );
    }
    for (const url of options.photoBackfill||result.items.length ? [] : result.menuImageUrls) {
      await client.query(
        `insert into website_assets(entity_id,website_id,page_url,asset_url,kind,source,metadata,active,last_seen_at)
         values($1,$2,$3,$4,'image','website_v3',$5::jsonb,true,now())
         on conflict(entity_id,asset_url) do update set website_id=excluded.website_id,page_url=excluded.page_url,
         source=excluded.source,metadata=excluded.metadata,active=true,last_seen_at=now()`,
        [target.entityId,target.websiteId,target.url,url,JSON.stringify({runId,menuDocument:true,verificationStatus:"pending_ocr"})]
      );
      await client.query(
        `insert into website_asset_jobs(run_id,entity_id,website_id,asset_url,kind)
         values($1,$2,$3,$4,'menu_image') on conflict(run_id,website_id,asset_url,kind) do nothing`,
        [runId,target.entityId,target.websiteId,url]
      );
    }

    const completed = result.status === "completed" || result.status === "empty";
    const retry = result.status === "failed" && target.attempts < 3;
    const jobStatus = completed ? "completed" : result.status === "blocked" ? "blocked" : retry ? "queued" : "failed";
    await client.query(
      `update web_crawl_jobs set status=$3,available_at=case when $3='queued' then now()+interval '6 hours' else available_at end,
       completed_at=case when $3 in ('completed','blocked','failed') then now() else null end,
       lease_token=null,lease_expires_at=null,last_error=$4,last_http_status=$5,result_metadata=$6::jsonb,updated_at=now()
       where id=$1 and lease_token=$2::uuid`,
      [target.jobId,target.leaseToken,jobStatus,result.error?.slice(0,500)??null,result.pages.at(-1)?.status??null,
       JSON.stringify({ collector: "website-v3.1.0",runId,status:result.status,items:result.items.length,pdfs:result.pdfUrls.length,menuImages:result.menuImageUrls.length,methods:result.methods })]
    );
    await client.query(
      `update restaurant_websites set platforms=$2,page_count=$3,menu_item_count=$4,photo_count=$5,pdf_count=$6,
       last_http_status=$7,last_live_crawl_at=now(),updated_at=now() where id=$1`,
      [target.websiteId,result.platforms,result.pages.length,result.items.length,result.linkedPhotos.length,result.pdfUrls.length,result.pages.at(-1)?.status??null]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally { client.release(); }
}

async function processAsset(pool: pg.Pool, job: AssetJob) {
  try {
    const reused=await pool.query(
      `with prior as (select * from website_asset_results where run_id=$2 and entity_id=$3 and asset_url=$5 and kind=$6 and status='completed' and asset_job_id<>$1 order by id limit 1)
       insert into website_asset_results(asset_job_id,run_id,entity_id,website_id,asset_url,kind,status,content_sha256,content_type,byte_count,page_count,extraction_method,extracted_item_count,evidence)
       select $1,$2,$3,$4,$5,$6,prior.status,prior.content_sha256,prior.content_type,prior.byte_count,prior.page_count,prior.extraction_method,prior.extracted_item_count,
         coalesce(prior.evidence,'{}'::jsonb)||jsonb_build_object('reusedFromAssetJobId',prior.asset_job_id) from prior
       on conflict(asset_job_id) do update set status=excluded.status,content_sha256=excluded.content_sha256,content_type=excluded.content_type,byte_count=excluded.byte_count,
         page_count=excluded.page_count,extraction_method=excluded.extraction_method,extracted_item_count=excluded.extracted_item_count,evidence=excluded.evidence returning 1`,
      [job.id,job.run_id,job.entity_id,job.website_id,job.asset_url,job.kind]
    );
    if(reused.rowCount){await pool.query(`update website_asset_jobs set status='completed',lease_token=null,lease_expires_at=null,last_error=null,updated_at=now() where id=$1`,[job.id]);return;}
    if (job.kind === "pdf" || job.kind === "menu_image") {
      const result = job.kind === "pdf" ? await extractPdfMenu(job.asset_url) : await extractMenuImage(job.asset_url);
      const status = result.error === "pdf_too_large" ? "too_large" : result.error ? "failed" : "completed";
      const client = await pool.connect();
      try {
        await client.query("begin");
        for (const item of result.items) {
          const fingerprint = itemFingerprint(item);
          await client.query(
            `insert into website_menu_observations(entity_id,website_id,source_key,item_name,item_description,image_url,price,item_fingerprint,active,last_seen_at,evidence_url,extraction_method,confidence,last_v3_run_id,absent_successful_runs)
             values($1,$2,'menu_ocr',$3,$4,$5,$6,$7,true,now(),$8,$9,$10,$11,0)
             on conflict(entity_id,source_key,item_fingerprint) do update set active=true,last_seen_at=now(),website_id=excluded.website_id,
             evidence_url=excluded.evidence_url,extraction_method=excluded.extraction_method,confidence=greatest(website_menu_observations.confidence,excluded.confidence),last_v3_run_id=excluded.last_v3_run_id,absent_successful_runs=0`,
            [job.entity_id,job.website_id,item.name,item.description??null,item.imageUrl??null,item.price??null,fingerprint,job.asset_url,result.method,
             result.method==="pdf_text"?0.7:0.82,job.run_id]
          );
        }
        await client.query(
          `insert into website_asset_results(asset_job_id,run_id,entity_id,website_id,asset_url,kind,status,content_sha256,byte_count,page_count,extraction_method,extracted_item_count,evidence)
           values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)
           on conflict(asset_job_id) do update set status=excluded.status,content_sha256=excluded.content_sha256,byte_count=excluded.byte_count,
           page_count=excluded.page_count,extraction_method=excluded.extraction_method,extracted_item_count=excluded.extracted_item_count,evidence=excluded.evidence`,
          [job.id,job.run_id,job.entity_id,job.website_id,job.asset_url,job.kind,status,result.sha256||null,result.byteCount||null,result.pageCount||null,
           result.method,result.items.length,JSON.stringify({ textCharacters: result.textCharacterCount,ocrAttempts: result.ocrAttempts??[] })]
        );
        await client.query(`update website_asset_jobs set status=$2,lease_token=null,lease_expires_at=null,last_error=$3,updated_at=now() where id=$1`,
          [job.id,status,result.error?.slice(0,500)??null]);
        await client.query("commit");
      } catch (error) { await client.query("rollback"); throw error; }
      finally { client.release(); }
      return;
    }

    const response = await fetch(job.asset_url,{headers:{accept:"image/*"},signal:AbortSignal.timeout(20_000)});
    const contentType=response.headers.get("content-type")?.split(";")[0]?.toLowerCase()??null;
    const bytes=Buffer.from(await response.arrayBuffer());
    const valid=response.ok&&Boolean(contentType?.startsWith("image/"))&&bytes.length>0&&bytes.length<=20*1024*1024;
    const hash=valid?createHash("sha256").update(bytes).digest("hex"):null;
    await pool.query(
      `with result as (
        insert into website_asset_results(asset_job_id,run_id,entity_id,website_id,asset_url,kind,status,content_sha256,content_type,byte_count,evidence)
        values($1,$2,$3,$4,$5,'image',$6,$7,$8,$9,$10::jsonb)
        on conflict(asset_job_id) do update set status=excluded.status,content_sha256=excluded.content_sha256,content_type=excluded.content_type,byte_count=excluded.byte_count,evidence=excluded.evidence returning 1)
       update website_asset_jobs set status=$6,lease_token=null,lease_expires_at=null,last_error=case when $6='failed' then 'invalid_or_unreachable_image' else null end,updated_at=now() where id=$1`,
      [job.id,job.run_id,job.entity_id,job.website_id,job.asset_url,valid?"completed":"failed",hash,contentType,bytes.length,JSON.stringify({ menuLinked: job.menu_linked,httpStatus:response.status })]
    );
    await pool.query(
      `update website_assets set metadata=metadata||$3::jsonb,last_seen_at=now()
       where entity_id=$1 and asset_url=$2`,
      [job.entity_id,job.asset_url,JSON.stringify({verificationStatus:valid?"byte_verified":"rejected",contentSha256:hash,contentType,byteCount:bytes.length,httpStatus:response.status})]
    );
  } catch (error) {
    const retry=job.attempts<3;
    await pool.query(`update website_asset_jobs set status=$2,available_at=case when $2='queued' then now()+interval '2 hours' else available_at end,
      lease_token=null,lease_expires_at=null,last_error=$3,updated_at=now() where id=$1`,[job.id,retry?"queued":"failed",String(error).slice(0,500)]);
  }
}

async function processAssets(pool: pg.Pool, runId: string, concurrency: number) {
  let processed=0;
  while (true) {
    const jobs=(await pool.query(`select * from lease_website_asset_jobs($1,$2,60)`,[runId,Math.max(10,concurrency*4)])).rows as AssetJob[];
    if (!jobs.length) break;
    let cursor=0;
    async function worker(){while(cursor<jobs.length)await processAsset(pool,jobs[cursor++]);}
    // Local PaddleOCR serializes model work; two callers keep it fed without
    // building a memory-heavy queue of identical in-flight documents.
    const workers=jobs.every(job=>job.kind==="image")?Math.min(16,concurrency):Math.min(2,concurrency);
    await Promise.all(Array.from({length:Math.min(workers,jobs.length)},()=>worker()));
    processed+=jobs.length;
    console.log(JSON.stringify({assetProgress:processed,lastBatch:jobs.length}));
  }
  return processed;
}

async function reconcileNamedWebsitePhotos(pool: pg.Pool, runId: string) {
  const assets=(await pool.query(
    `select entity_id,website_id,asset_url,page_url,metadata->>'namedFoodLabel' label
     from website_assets where metadata->>'runId'=$1 and active
       and metadata->>'namedPhotoCandidate'='true' and metadata->>'verificationStatus'='byte_verified'
     order by entity_id,asset_url`,[runId]
  )).rows as Array<{entity_id:string;website_id:string;asset_url:string;page_url:string;label:string}>;
  if(!assets.length)return{namedPhotoCandidates:0,namedPhotoMatches:0,namedPhotoAmbiguous:0,namedPhotoUnmatched:0};
  const entityIds=[...new Set(assets.map(asset=>asset.entity_id))];
  const observations=(await pool.query(
    `select distinct on(entity_id,source_key,item_fingerprint) entity_id,website_id,source_key,item_name,item_description,image_url,price,extraction_method,confidence
     from website_menu_observations where entity_id=any($1::uuid[]) and active and confidence>=0.78
     order by entity_id,source_key,item_fingerprint,confidence desc,last_seen_at desc`,[entityIds]
  )).rows;
  const byEntity=new Map<string,typeof observations>();
  for(const observation of observations){const group=byEntity.get(observation.entity_id)??[];group.push(observation);byEntity.set(observation.entity_id,group);}
  let matched=0,ambiguous=0,unmatched=0;
  const matchedByEntity=new Map<string,number>();
  const pendingWrites:Array<Promise<unknown>>=[];
  async function scheduleWrite(write:Promise<unknown>){
    pendingWrites.push(write);
    if(pendingWrites.length>=32)await Promise.all(pendingWrites.splice(0));
  }
  for(const asset of assets){
    const menu=new Map<string,(typeof observations)[number]>();
    for(const observation of byEntity.get(asset.entity_id)??[]){const key=normalizeMenuItemName(observation.item_name);const current=menu.get(key);if(!current||Number(observation.confidence)>Number(current.confidence))menu.set(key,observation);}
    const ranked=[...menu.values()].map(observation=>({observation,score:namedPhotoDishMatchScore(asset.label,observation.item_name)}))
      .filter(candidate=>candidate.score>=85).sort((left,right)=>right.score-left.score||left.observation.item_name.localeCompare(right.observation.item_name));
    const top=ranked[0],second=ranked[1];
    const status=!top?"unmatched":second&&top.score===second.score?"ambiguous":"matched";
    if(status!=="matched"){
      if(status==="ambiguous")ambiguous++;else unmatched++;
      await scheduleWrite(pool.query(`update website_assets set metadata=metadata||$3::jsonb,last_seen_at=now() where entity_id=$1 and asset_url=$2`,
        [asset.entity_id,asset.asset_url,JSON.stringify({namedMatchStatus:status,matchedAt:new Date().toISOString()})]));
      continue;
    }
    const observation=top.observation;
    if(observation.image_url===asset.asset_url){
      await scheduleWrite(pool.query(`update website_assets set metadata=metadata||$3::jsonb,last_seen_at=now() where entity_id=$1 and asset_url=$2`,
        [asset.entity_id,asset.asset_url,JSON.stringify({namedMatchStatus:"matched",matchedMenuName:observation.item_name,matchScore:top.score,matchedAt:new Date().toISOString()})]));
      matched++;matchedByEntity.set(asset.entity_id,(matchedByEntity.get(asset.entity_id)??0)+1);
      continue;
    }
    const item={name:observation.item_name,description:observation.item_description??undefined,imageUrl:asset.asset_url,price:observation.price===null?undefined:Number(observation.price)};
    const fingerprint=itemFingerprint(item);
    await scheduleWrite(pool.query(
      `insert into website_menu_observations(entity_id,website_id,source_key,item_name,item_description,image_url,price,item_fingerprint,active,last_seen_at,evidence_url,extraction_method,confidence,last_v3_run_id,absent_successful_runs)
       values($1,$2,$3,$4,$5,$6,$7,$8,true,now(),$9,$10,$11,$12,0)
       on conflict(entity_id,source_key,item_fingerprint) do update set active=true,last_seen_at=now(),website_id=excluded.website_id,
         evidence_url=excluded.evidence_url,extraction_method=excluded.extraction_method,confidence=greatest(website_menu_observations.confidence,excluded.confidence),
         last_v3_run_id=excluded.last_v3_run_id,absent_successful_runs=0`,
      [asset.entity_id,asset.website_id,observation.source_key,observation.item_name,observation.item_description??null,asset.asset_url,
       observation.price??null,fingerprint,asset.page_url,`${observation.extraction_method}+named_gallery_photo`,Math.max(Number(observation.confidence),0.9),runId]
    ));
    await scheduleWrite(pool.query(`update website_assets set metadata=metadata||$3::jsonb,last_seen_at=now() where entity_id=$1 and asset_url=$2`,
      [asset.entity_id,asset.asset_url,JSON.stringify({namedMatchStatus:"matched",matchedMenuName:observation.item_name,matchScore:top.score,matchedAt:new Date().toISOString()})]));
    matched++;matchedByEntity.set(asset.entity_id,(matchedByEntity.get(asset.entity_id)??0)+1);
  }
  await Promise.all(pendingWrites);
  for(const [entityId,count] of matchedByEntity){
    await pool.query(`update website_crawl_v3_results set menu_linked_photo_count=greatest(menu_linked_photo_count,$3) where run_id=$1 and entity_id=$2`,[runId,entityId,count]);
    await pool.query(`update restaurant_websites set photo_count=greatest(photo_count,$2),updated_at=now() where entity_id=$1`,[entityId,count]);
  }
  return{namedPhotoCandidates:assets.length,namedPhotoMatches:matched,namedPhotoAmbiguous:ambiguous,namedPhotoUnmatched:unmatched};
}

async function finalizeRun(pool:pg.Pool,runId:string,assetsProcessed:number,namedPhotoMetrics:Record<string,number>={}){
  const metrics=(await pool.query(`select count(*) total,count(*) filter(where status='completed') completed,count(*) filter(where status='empty') empty,
    count(*) filter(where status='blocked') blocked,count(*) filter(where status='failed') failed,count(distinct entity_id) filter(where item_count>0) restaurants_with_menu,
    coalesce(sum(item_count),0) items,coalesce(sum(menu_linked_photo_count),0) linked_photos,coalesce(sum(generic_photo_candidate_count),0) generic_photos,
    coalesce(sum(pdf_discovered_count),0) pdfs from website_crawl_v3_results where run_id=$1`,[runId])).rows[0];
  const assetMetrics=(await pool.query(`select count(*) assets,count(*) filter(where status='completed') asset_completed,
    coalesce(sum(extracted_item_count),0) pdf_items,count(distinct content_sha256) filter(where kind='image' and status='completed') unique_image_bytes
    from website_asset_results where run_id=$1`,[runId])).rows[0];
  await pool.query(`update website_crawl_v3_runs set status='completed',completed_count=$2,empty_count=$3,blocked_count=$4,failed_count=$5,
    restaurant_with_menu_count=$6,item_count=$7,menu_linked_photo_count=$8,generic_photo_candidate_count=$9,pdf_discovered_count=$10,
    metadata=$11::jsonb,completed_at=now() where id=$1`,[runId,metrics.completed,metrics.empty,metrics.blocked,metrics.failed,metrics.restaurants_with_menu,
    metrics.items,metrics.linked_photos,metrics.generic_photos,metrics.pdfs,JSON.stringify({assetsProcessed,...assetMetrics,...namedPhotoMetrics})]);
  return {...metrics,...assetMetrics};
}

async function main(){
  loadEnv();
  delete process.env.SCRAPFLY_KEY;
  const options=args(),productCorpus=options["product-corpus"]==="true",market=productCorpus?"product-corpus-us":options.market??"temecula-ca";
  const limit=Math.min(5000,Math.max(1,Number(options.limit??5000)));
  const concurrency=Math.min(16,Math.max(1,Number(options.concurrency??8)));
  const renderEnabled=options["no-render"]!=="true";
  if(renderEnabled){const python=ensurePythonEnv();if(!python.ready)throw new Error(`Advanced browser environment unavailable: ${python.reason}`);}
  const pool=new pg.Pool({connectionString:connectionString(),ssl:{rejectUnauthorized:false},max:concurrency+4});
  if(options["assets-run-id"]){
    const processed=await processAssets(pool,options["assets-run-id"],concurrency);
    const namedPhotoMetrics=await reconcileNamedWebsitePhotos(pool,options["assets-run-id"]);
    const metrics=await finalizeRun(pool,options["assets-run-id"],processed,namedPhotoMetrics);
    console.log(JSON.stringify({runId:options["assets-run-id"],assetsProcessed:processed,...metrics,...namedPhotoMetrics},null,2));
    await pool.end();return;
  }
  if(options["run-id"]){throw new Error("V3 run resumption is automatic through durable jobs; omit --run-id");}
  if(productCorpus)await pool.query(`select queue_web_crawl_v3_product_corpus($1)`,[options.refresh==="true"]);
  else await pool.query(`select queue_web_crawl_v3_market($1,$2)`,[market,options.refresh==="true"]);
  const leaseSql=productCorpus
    ? `select j.id "jobId",j.entity_id "entityId",j.website_id "websiteId",j.attempts,j.lease_token "leaseToken",w.url,w.domain,e.name "restaurantName",e.address "restaurantAddress",
         array(select m.market_key from acquisition_market_entities m where m.entity_id=j.entity_id and m.active) "marketKeys"
       from lease_web_crawl_v3_product_corpus($1,90) j join restaurant_websites w on w.id=j.website_id join restaurant_entities e on e.id=j.entity_id`
    : `select j.id "jobId",j.entity_id "entityId",j.website_id "websiteId",j.attempts,j.lease_token "leaseToken",w.url,w.domain,e.name "restaurantName",e.address "restaurantAddress",
         array(select mm.market_key from acquisition_market_entities mm where mm.entity_id=j.entity_id and mm.active) "marketKeys"
       from lease_web_crawl_v3_jobs($1,$2,90) j join restaurant_websites w on w.id=j.website_id join restaurant_entities e on e.id=j.entity_id`;
  const leasedAll=(await pool.query(leaseSql,productCorpus?[limit]:[market,limit]
  )).rows as WebsiteV3Target[];
  let leased=leasedAll;
  if(options["recovery-only"]==="true"){
    const successful=new Set((await pool.query(`select distinct o.entity_id from website_menu_observations o join acquisition_market_entities m on m.entity_id=o.entity_id and m.market_key=$1 and m.active where o.active`,[market])).rows.map(row=>row.entity_id));
    leased=leasedAll.filter(target=>!successful.has(target.entityId));
    const skipped=leasedAll.filter(target=>successful.has(target.entityId)).map(target=>target.jobId);
    if(skipped.length)await pool.query(`update web_crawl_jobs set status='completed',lease_token=null,lease_expires_at=null,completed_at=now(),updated_at=now() where id=any($1::uuid[])`,[skipped]);
  }
  const run=(await pool.query(`insert into website_crawl_v3_runs(market_key,collector_version,configuration,leased_count)
    values($1,'website-v3.2.0',$2::jsonb,$3) returning id`,[market,JSON.stringify({concurrency,renderEnabled,maxPages:12,productCorpus,photoBackfill:productCorpus,paidOcrEnabled:false,paidWebFallback:false}),leased.length])).rows[0];
  const runId=run.id as string;
  let finished=0;
  log.setLevel(log.LEVELS.INFO);
  const requestQueue=await RequestQueue.open(`website-v3-${runId}`);
  const domainTails=new Map<string,Promise<void>>();
  const crawler=new BasicCrawler({requestQueue,maxConcurrency:concurrency,maxRequestRetries:0,requestHandlerTimeoutSecs:240,
    async requestHandler({request}){
      const target=request.userData.target as WebsiteV3Target;
      const previous=domainTails.get(target.domain)??Promise.resolve();
      const current=previous.then(async()=>{const result=await crawlWebsiteV3(target,{renderEnabled,maxPages:12,deepDiscovery:options["deep-discovery"]==="true"});await persistWebsiteResult(pool,runId,target,result,{photoBackfill:productCorpus});
        finished++;if(finished%10===0||finished===leased.length)console.log(JSON.stringify({progress:`${finished}/${leased.length}`,restaurant:target.restaurantName,status:result.status,items:result.items.length,pdfs:result.pdfUrls.length,methods:result.methods}));});
      domainTails.set(target.domain,current.catch(()=>{}));
      await current;
    },
    async failedRequestHandler({request},error){const target=request.userData.target as WebsiteV3Target;await persistWebsiteResult(pool,runId,target,{status:"failed",items:[],namedPhotos:[],genericPhotos:[],linkedPhotos:[],menuImageUrls:[],pdfUrls:[],pages:[],platforms:[],methods:[],routeDecisions:[],elapsedMs:0,error:String(error)},{photoBackfill:productCorpus});finished++;}
  });
  try{
    await crawler.run(leased.map(target=>({url:target.url,uniqueKey:target.jobId,userData:{target}})));
    const assets=options["skip-assets"]==="true"?0:await processAssets(pool,runId,concurrency);
    const namedPhotoMetrics=options["skip-assets"]==="true"?{}:await reconcileNamedWebsitePhotos(pool,runId);
    const metrics=await finalizeRun(pool,runId,assets,namedPhotoMetrics);
    const assetMetrics={assets:metrics.assets,asset_completed:metrics.asset_completed,pdf_items:metrics.pdf_items,unique_image_bytes:metrics.unique_image_bytes};
    console.log(JSON.stringify({runId,market,...metrics,...assetMetrics,...namedPhotoMetrics},null,2));
  }catch(error){await pool.query(`update website_crawl_v3_runs set status='failed',metadata=jsonb_build_object('error',$2::text),completed_at=now() where id=$1`,[runId,String(error)]);throw error;}
  finally{await pool.end();}
}

main().catch(error=>{console.error(error);process.exitCode=1;});
