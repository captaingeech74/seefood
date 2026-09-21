#!/usr/bin/env -S npx tsx
/** Generate a publication artifact only from explicitly reviewed routes. */
import {readFileSync,writeFileSync} from "node:fs";
const args=Object.fromEntries(process.argv.slice(2).map(s=>s.replace(/^--/,"").split("=")));
if(!args.input||!args.review||!args.output)throw new Error("--input=rollout.json --review=review.json --output=manifest.json");
const input=JSON.parse(readFileSync(args.input,"utf8"));
const review=JSON.parse(readFileSync(args.review,"utf8"));
const groups=[];
for(const entry of review.routes){
  const record=input.records.find((r:any)=>r.target.entity_id===entry.entityId&&r.target.url===entry.url);
  if(!record?.result)throw new Error(`Missing reviewed extraction: ${entry.entityId}`);
  const items=record.result.items.filter((e:any)=>e.confidence>=0.78&&(!entry.photoOnly||e.item.imageUrl)&&(!entry.method||new RegExp(entry.method).test(e.method))&&(!entry.evidenceUrl||e.evidenceUrl===entry.evidenceUrl));
  if(!items.length)continue;
  const bySource=new Map<string,any[]>();
  for(const evidence of items){const source=entry.source??evidence.sourceKey??"schema_org";const list=bySource.get(source)??[];list.push(evidence);bySource.set(source,list);}
  for(const [source,list]of bySource)groups.push({entityId:entry.entityId,name:record.target.name,source,identityEvidence:entry.identityEvidence,items:list});
}
writeFileSync(args.output,JSON.stringify({createdAt:new Date().toISOString(),input:args.input,review:args.review,groups},null,2),{flag:"wx"});
console.log(JSON.stringify({groups:groups.length,items:groups.reduce((n,g)=>n+g.items.length,0),photoCandidates:groups.reduce((n,g)=>n+g.items.filter((e:any)=>e.item.imageUrl).length,0)}));
