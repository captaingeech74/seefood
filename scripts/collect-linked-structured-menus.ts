#!/usr/bin/env -S npx tsx
/** Read-only follow-up for public ordering links discovered on official sites.
 * Keeps all branch evidence separate. Publication still requires review. */
import {readFileSync,writeFileSync,existsSync} from 'node:fs';
import {crawlWebsiteV3} from '../src/crawler/websiteV3';
const directory='logs/structured-platforms-20260920';
async function main(){
  const discovery=JSON.parse(readFileSync(`${directory}/discovery.json`,'utf8'));
  const rollout=JSON.parse(readFileSync(`${directory}/rollout.json`,'utf8'));
  const output=`${directory}/spoton-rollout.json`;
  const records:any[]=existsSync(output)?JSON.parse(readFileSync(output,'utf8')).records:[];
  const seen=new Set(records.map(r=>r.target.entity_id+'|'+r.target.url));
  const targets:any[]=[];
  for(const record of rollout.records){const found=discovery.records.find((d:any)=>d.url===record.target.url);for(const link of found?.links??[]){
    let u:URL;try{u=new URL(link);}catch{continue;}if(u.hostname!=='order.spoton.com')continue;u.search='';u.hash='';
    const key=record.target.entity_id+'|'+u.href;if(seen.has(key))continue;seen.add(key);
    // Skip explicit other-city locations; within-city branches stay separate
    // for address review rather than assuming a shared menu.
    if(/\/la-jolla-ca\//.test(u.pathname)&&/carlsbad/i.test(record.target.address??''))continue;
    targets.push({...record.target,url:u.href,domain:u.hostname,discoveryUrl:record.target.url});
  }}
  for(const target of targets){
    const result=await crawlWebsiteV3({websiteId:target.website_id,entityId:target.entity_id,jobId:'linked-spoton',leaseToken:'read-only',url:target.url,domain:target.domain,restaurantName:target.name,restaurantAddress:target.address,marketKeys:target.markets,attempts:1},{renderEnabled:true,maxPages:2,deepDiscovery:false});
    records.push({target,result});writeFileSync(output,JSON.stringify({records},null,2));
    console.log(JSON.stringify({name:target.name,url:target.url,status:result.status,items:result.items.length,photos:result.linkedPhotos.length,error:result.error}));
  }
}main().catch(error=>{console.error(error);process.exitCode=1;});
