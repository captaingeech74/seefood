#!/usr/bin/env -S npx tsx
/** All live cities, including future additions. Preview by default; --publish
 * enables additive publication. No city allowlist and no paid services. */
import {existsSync, readFileSync, writeFileSync, mkdirSync, renameSync, rmdirSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import pg from "pg";
import {crawlWebsiteV3, safePublicUrl} from "../src/crawler/websiteV3";
import {automaticItemEligible, routeIsDue, type RouteState} from "../src/lib/structuredRollout";

const arg=(key:string)=>process.argv.find(a=>a.startsWith(`--${key}=`))?.slice(key.length+3);
async function main(){
  for(const line of readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
  delete process.env.SCRAPFLY_KEY;
  const root=resolve('logs/structured-platform-rollout');mkdirSync(root,{recursive:true});
  const lock=resolve(root,'runner.lock');
  try{mkdirSync(lock);}catch{throw new Error('Another rollout is active (or interrupted). Inspect runner.lock before retrying.');}
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace('[YOUR-PASSWORD]',encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??'')),ssl:{rejectUnauthorized:false},statement_timeout:60000});
  try{
    await db.connect();
    const file=resolve(root,'state.json');
    const state:Record<string,RouteState>=existsSync(file)?JSON.parse(readFileSync(file,'utf8')):{};
    const reviewed=JSON.parse(readFileSync('scripts/config/structured-platform-refresh.json','utf8')).routes;
    // Reuse the completed citywide pass. Do not pay its fetch cost again just
    // because the operational scheduler has changed. Seed keys per entity.
    const legacy='logs/structured-platforms-20260920';
    if(!existsSync(file)&&existsSync(`${legacy}/discovery.json`)){
      const discovery=JSON.parse(readFileSync(`${legacy}/discovery.json`,'utf8'));
      for(const record of discovery.records)for(const id of record.entities){
        state[`${id}|${record.url}`]={at:discovery.updatedAt,status:record.status==='failed'?'failed':'discovered',hasPlatform:Boolean(record.platforms.length||record.knownPlatforms.length)};
      }
      if(existsSync(`${legacy}/rollout.json`))for(const r of JSON.parse(readFileSync(`${legacy}/rollout.json`,'utf8')).records){
        state[`${r.target.entity_id}|${r.target.url}`]={at:r.finishedAt??discovery.updatedAt,status:r.result?.status??'failed',hasPlatform:true};
      }
    }
    const all=(await db.query(`select w.id,w.entity_id,w.url,w.domain,e.name,e.address,
      array(select m.market_key from acquisition_market_entities m where m.entity_id=e.id and m.active) markets
      from restaurant_websites w join restaurant_entities e on e.id=w.entity_id
      where w.active and exists(select 1 from restaurants r where r.entity_id=e.id and r.status not in ('inactive','test_fixture'))
      order by w.entity_id,w.url`)).rows;
    const limit=Number(arg('limit')??60);
    if(!Number.isInteger(limit)||limit<1||limit>2500)throw new Error('limit must be 1–2500');
    const selection=all.filter(r=>(!arg('entity')||r.entity_id===arg('entity'))&&(!arg('market')||r.markets.includes(arg('market'))));
    const due=selection.filter(r=>process.argv.includes('--force')||routeIsDue(state[`${r.entity_id}|${r.url}`]));
    // New restaurants first, then oldest attempt: repeated failures cannot starve new cities.
    due.sort((a,b)=>Date.parse(state[`${a.entity_id}|${a.url}`]?.at??'1970-01-01')-Date.parse(state[`${b.entity_id}|${b.url}`]?.at??'1970-01-01'));
    const publish=process.argv.includes('--publish');
    const report:any={at:new Date().toISOString(),liveWebsiteRoutes:all.length,selectedScope:selection.length,due:due.length,attempted:0,publishedGroups:0,heldGroups:0,failed:0,markets:[...new Set(all.flatMap(r=>r.markets))],publish};
    const run=resolve(root,report.at.replace(/[:.]/g,'-'));mkdirSync(run);
    const save=()=>{writeFileSync(file+'.tmp',JSON.stringify(state,null,2));renameSync(file+'.tmp',file);};
    if(process.argv.includes('--plan')){
      writeFileSync(resolve(run,'report.json'),JSON.stringify(report,null,2));
      console.log(JSON.stringify(report,null,2));return;
    }
    // Persist bootstrap even with no due routes. --plan never changes state.
    if(publish)save();
    const batch=due.slice(0,limit), domainTails=new Map<string,Promise<void>>();
    let cursor=0, fatal:unknown;
    async function processTarget(target:any){
      const key=`${target.entity_id}|${target.url}`,hash=createHash('sha256').update(key).digest('hex').slice(0,16);
      report.attempted++;
      try{
        if(!safePublicUrl(target.url))throw new Error('invalid website URL');
        const result=await crawlWebsiteV3({websiteId:target.id,entityId:target.entity_id,jobId:`rollout-${hash}`,leaseToken:'bounded-local',url:target.url,domain:target.domain,restaurantName:target.name,restaurantAddress:target.address,marketKeys:target.markets,attempts:1},{renderEnabled:true,maxPages:4,deepDiscovery:false});
        const review=reviewed.find((r:any)=>r.entityId===target.entity_id&&r.url===target.url);
        const proven=new Set(result.pages.filter(p=>p.locationProof).map(p=>p.finalUrl));
        const items=result.items.filter(e=>review
          ? e.confidence>=0.78&&(!review.photoOnly||e.item.imageUrl)&&(!review.method||new RegExp(review.method).test(e.method))&&(!review.evidenceUrl||e.evidenceUrl===review.evidenceUrl)
          : automaticItemEligible(e,proven));
        const groups:any[]=[];
        for(const source of new Set(items.map(e=>review?.source??e.sourceKey))){
          const entries=items.filter(e=>(review?.source??e.sourceKey)===source);
          if(entries.length>300){report.heldGroups++;continue;}
          groups.push({entityId:target.entity_id,name:target.name,source,identityEvidence:review?.identityEvidence??result.pages.filter(p=>p.locationProof).map(p=>`${p.finalUrl}: ${p.locationProof}`).join('; '),items:entries});
        }
        writeFileSync(resolve(run,`${hash}.json`),JSON.stringify({target,result,eligibleItems:items.length},null,2));
        const manifest=resolve(run,`${hash}.manifest.json`);
        writeFileSync(manifest,JSON.stringify({groups},null,2));
        if(groups.length&&publish){
          const child=spawnSync(process.execPath,['--import','tsx','scripts/publish-structured-platforms.ts',`--manifest=${manifest}`,'--publish'],{stdio:'inherit',timeout:600000});
          if(child.error||child.status!==0)throw new Error(`publication failed; inspect journal before retry: ${child.error??child.status}`);
          report.publishedGroups+=groups.length;
        }
        if(result.items.length>items.length)report.heldGroups++;
        if(publish){state[key]={at:new Date().toISOString(),status:result.status,hasPlatform:result.platforms.length>0||Boolean(review)||Boolean(state[key]?.hasPlatform)};save();}
        console.log(JSON.stringify({name:target.name,status:result.status,items:result.items.length,eligible:items.length,publish}));
      }catch(error){
        report.failed++;
        // Stop on publication failures: never silently retry a partially written group.
        writeFileSync(resolve(run,`${hash}.error.json`),JSON.stringify({name:target.name,error:String(error)}));
        if(String(error).includes('publication failed'))throw error;
        if(publish){state[key]={at:new Date().toISOString(),status:'failed'};save();}
      }
      writeFileSync(resolve(run,'report.json'),JSON.stringify(report,null,2));
    }
    async function worker(){while(cursor<batch.length&&!fatal){
      const target=batch[cursor++], previous=domainTails.get(target.domain)??Promise.resolve();
      const work=previous.then(()=>processTarget(target));domainTails.set(target.domain,work.catch(()=>{}));
      try{await work;}catch(error){fatal=error;}
    }}
    await Promise.all(Array.from({length:3},()=>worker()));
    if(fatal)throw fatal;
    report.remainingDue=Math.max(0,due.length-report.attempted);
    writeFileSync(resolve(run,'report.json'),JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));
  }finally{await db.end();rmdirSync(lock);}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
