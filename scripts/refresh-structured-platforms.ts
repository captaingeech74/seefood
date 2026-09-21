#!/usr/bin/env -S npx tsx
/** Small monthly refresh of reviewed routes, piggybacked on the nightly job.
 * No source discovery or paid services. Collection-only unless --publish. */
import {existsSync,readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {resolve} from "node:path";
import {spawnSync} from "node:child_process";
import {createHash} from "node:crypto";
import pg from "pg";
import {crawlWebsiteV3} from "../src/crawler/websiteV3";

async function main(){
  for(const line of readFileSync('.env.local','utf8').split('\n')){const m=line.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
  const registry=JSON.parse(readFileSync('scripts/config/structured-platform-refresh.json','utf8'));
  const root=resolve('logs/structured-platform-refresh');mkdirSync(root,{recursive:true});
  const stateFile=resolve(root,'state.json');const state=existsSync(stateFile)?JSON.parse(readFileSync(stateFile,'utf8')):{};
  const limit=Math.min(5,Math.max(1,Number(process.argv.find(a=>a.startsWith('--limit='))?.split('=')[1]??3)));
  const routes=registry.routes.filter((r:any)=>Date.now()-Date.parse(state[`${r.entityId}|${r.url}`]??'1970-01-01')>registry.refreshDays*86400000);
  if(!routes.length){console.log('Structured routes are current; no work.');return;}
  const dir=resolve(root,new Date().toISOString().replace(/[:.]/g,'-'));mkdirSync(dir);
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace('[YOUR-PASSWORD]',encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??'')),ssl:{rejectUnauthorized:false}});await db.connect();
  try{
    let attempted=0,current=0;
    for(const route of routes){
      if(attempted>=limit)break;
      const latest=(await db.query("select max(completed_at) completed_at from source_snapshots where entity_id=$1 and source=$2 and status='succeeded' and discovered_photo_count>0",[route.entityId,route.source])).rows[0]?.completed_at;
      if(latest&&Date.now()-new Date(latest).getTime()<registry.refreshDays*86400000){current++;continue;}
      const target=(await db.query(`select e.name,e.address,w.id,w.domain from restaurant_entities e join restaurant_websites w on w.entity_id=e.id and w.active and w.url=$2 where e.id=$1 and exists(select 1 from restaurants r where r.entity_id=e.id and r.status not in ('inactive','test_fixture')) limit 1`,[route.entityId,route.discoveryUrl??route.url])).rows[0];
      if(!target){console.log(JSON.stringify({entityId:route.entityId,status:'inactive_or_route_changed'}));continue;}
      attempted++;
      const key=createHash('sha256').update(route.entityId+route.url).digest('hex').slice(0,16);
      const result=await crawlWebsiteV3({websiteId:target.id,entityId:route.entityId,jobId:`refresh-${key}`,leaseToken:'local-bounded-refresh',url:route.url,domain:new URL(route.url).hostname,restaurantName:target.name,restaurantAddress:target.address,marketKeys:[],attempts:1},{renderEnabled:true,maxPages:4,deepDiscovery:false});
      const input=resolve(dir,`${key}.json`),review=resolve(dir,`${key}.review.json`),manifest=resolve(dir,`${key}.manifest.json`);
      writeFileSync(input,JSON.stringify({records:[{target:{entity_id:route.entityId,name:target.name,url:route.url},result}]}));
      writeFileSync(review,JSON.stringify({routes:[route]}));
      const run=(script:string,args:string[])=>{const p=spawnSync(process.execPath,['--import','tsx',script,...args],{stdio:'inherit',timeout:600000});if(p.error||p.status!==0)throw p.error??new Error(`Failed: ${script}`);};
      run('scripts/prepare-structured-publication.ts',[`--input=${input}`,`--review=${review}`,`--output=${manifest}`]);
      if(process.argv.includes('--publish')){
        run('scripts/publish-structured-platforms.ts',[`--manifest=${manifest}`,'--publish']);
        // A transient miss never retires data; don't hammer it nightly either.
        state[`${route.entityId}|${route.url}`]=new Date().toISOString();writeFileSync(stateFile,JSON.stringify(state,null,2));
      }
    }
    console.log(JSON.stringify({reviewedRoutes:registry.routes.length,alreadyCurrent:current,attempted,publish:process.argv.includes('--publish')}));
  }finally{await db.end();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
