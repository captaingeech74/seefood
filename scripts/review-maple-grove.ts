/** Scoped onboarding evidence/review; never changes pre-existing live cities. */
import {readFileSync,writeFileSync,existsSync,mkdirSync} from 'node:fs';
import {randomUUID} from 'node:crypto';
import pg from 'pg';
import * as cheerio from 'cheerio';
import sharp from 'sharp';
import {isOvertureFoodServicePlace,overtureFoodServiceCategories} from '../src/lib/overturePolicy';
import {verifiedSupabaseSsl} from './lib/verifiedSupabaseSsl.mjs';
const root='logs/maple-grove',market='maple-grove-mn';
const normalize=(s:string)=>s.toLowerCase().replace(/[^a-z0-9]/g,'');
async function main(){
  mkdirSync(root,{recursive:true});
  for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace('[YOUR-PASSWORD]',encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??'')),ssl:verifiedSupabaseSsl()});await db.connect();
  try{
    const entities=(await db.query(`select e.*,array(select provider_id from restaurant_identities i where i.entity_id=e.id and i.provider='overture' and i.active) provider_ids from restaurant_entities e join acquisition_market_entities m on m.entity_id=e.id where m.market_key=$1 and m.active order by e.name`,[market])).rows;
    if(process.argv.includes('--prepare-input')){
      const p=process.argv.indexOf('--input'),input=process.argv[p+1];if(p<0)throw new Error('--input required');
      const features=readFileSync(input,'utf8').trim().split('\n').map(l=>JSON.parse(l));
      const known=new Set(entities.flatMap(e=>e.provider_ids));
      const extra=features.filter(f=>isOvertureFoodServicePlace(f.properties)&&!known.has(f.id));
      writeFileSync(`${root}/additional-places.geojsonseq`,extra.map(f=>JSON.stringify(f)).join('\n')+'\n');
      const patches=entities.flatMap(e=>{const f=features.find(f=>e.provider_ids.includes(f.id));return f&&e.categories.length===0?[{id:e.id,name:e.name,before:e.categories,categories:overtureFoodServiceCategories(f.properties)}]:[];});
      writeFileSync(`${root}/classification-review.json`,JSON.stringify(patches,null,2));
      console.log({additionalFoodCandidatesInBounds:extra.length,emptyClassificationsToRestore:patches.length});
    }
    if(process.argv.includes('--apply-classifications')){
      const patches=JSON.parse(readFileSync(`${root}/classification-review.json`,'utf8'));
      await db.query('begin');
      for(const p of patches)await db.query(`update restaurant_entities e set categories=$2,updated_at=now() where id=$1 and cardinality(categories)=0 and exists(select 1 from acquisition_market_entities m where m.entity_id=e.id and m.market_key=$3 and m.active)`,[p.id,p.categories,market]);
      await db.query('commit');console.log({reviewed:patches.length});
    }
    if(process.argv.includes('--directory')){
      const rows:any[]=[];
      for(let page=1;page<=2;page++){const r=await fetch(`https://experiencemaplegrove.com/wp-json/wp/v2/dine-location?per_page=100&page=${page}&_fields=id,title,link,slug`,{signal:AbortSignal.timeout(30000)});if(!r.ok)throw new Error(`directory ${r.status}`);rows.push(...await r.json() as any[]);}
      const directory=rows.map(r=>{const name=cheerio.load(r.title.rendered).text();const key=normalize(name);const matches=entities.filter(e=>{const n=normalize(e.name);return n===key||(Math.min(n.length,key.length)>=7&&(n.includes(key)||key.includes(n)));});return {name,url:r.link,matches:matches.map(e=>({id:e.id,name:e.name,address:e.address}))};});
      writeFileSync(`${root}/directory.json`,JSON.stringify(directory,null,2));
      console.log(JSON.stringify({directory:directory.length,withoutNameMatch:directory.filter(r=>!r.matches.length)},null,2));
    }
    if(process.argv.includes('--review-roster')){
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));
      const decisions:any[]=[];
      for(const e of entities){
        if(e.name==='Leeann Chin'&&e.address?.startsWith('9428'))continue;
        const rule=config.hold.find((r:any)=>r.names.includes(e.name));
        if(rule)decisions.push({id:e.id,name:e.name,address:e.address,reason:rule.reason});
      }
      for(const rule of config.duplicates){
        const candidates=entities.filter(e=>rule.names.includes(e.name)&&(!rule.street||e.address?.startsWith(rule.street)));
        if(candidates.length<2)continue;
        candidates.sort((a,b)=>Number(b.operating_status==='open')-Number(a.operating_status==='open')||Number(b.name===rule.preferred)-Number(a.name===rule.preferred)||Number(b.website?.startsWith('https:'))-Number(a.website?.startsWith('https:'))||a.id.localeCompare(b.id));
        for(const e of candidates.slice(1))decisions.push({id:e.id,name:e.name,address:e.address,reason:`Duplicate of ${candidates[0].id}; same named venue and street address`});
      }
      const file=`${root}/roster-before.json`;
      if(!existsSync(file))writeFileSync(file,JSON.stringify({at:new Date().toISOString(),entities,decisions},null,2),{flag:'wx'});
      const liveBefore=(await db.query(`select * from restaurants where entity_id=any($1::uuid[])`,[decisions.map(d=>d.id)])).rows;
      if(liveBefore.length&&!existsSync(`${root}/roster-live-before.json`))writeFileSync(`${root}/roster-live-before.json`,JSON.stringify(liveBefore,null,2),{flag:'wx'});
      await db.query('begin');
      for(const d of decisions){
        await db.query(`update restaurant_entities set backbone_state='quarantined',updated_at=now() where id=$1`,[d.id]);
        await db.query(`update restaurants r set status='inactive',updated_at=now() where entity_id=$1 and exists(select 1 from market_publication_actions a join market_publication_runs p on p.id=a.run_id where a.place_id=r.place_id and p.market_key=$2 and a.action='created') and not exists(select 1 from photos p where p.restaurant_id=r.place_id)`,[d.id,market]);
      }
      await db.query('commit');writeFileSync(`${root}/roster-decisions.json`,JSON.stringify(decisions,null,2));
      console.log({held:decisions.length,reasons:decisions});
    }
    if(process.argv.includes('--supplement')){
      const input=process.argv[process.argv.indexOf('--input')+1];
      const features=readFileSync(input,'utf8').trim().split('\n').map(l=>JSON.parse(l));
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));
      const journal:any[]=[];
      await db.query('begin');
      for(const spec of config.supplements){
        const f=features.find(f=>f.id===spec.overtureId);
        const donor=spec.coordinateFrom?entities.find(e=>e.name===spec.coordinateFrom):null;
        const name=spec.name??f.properties.names.primary;
        const a=f?.properties.addresses[0];
        const address=spec.address??`${a.freeform}, ${a.locality}, ${a.region} ${a.postcode}`;
        const [lng,lat]=f?.geometry.coordinates??[donor.lng,donor.lat];
        const website=spec.website??f.properties.websites[0];
        const key=`${spec.evidence}#${normalize(name)}`;
        const known=(await db.query(`select entity_id from restaurant_identities where provider='official_website' and provider_id=$1`,[key])).rows[0];
        if(known){journal.push({name,id:known.entity_id,status:'already_added'});continue;}
        const id=randomUUID();
        const old=f?(await db.query(`select * from restaurant_identities where provider='overture' and provider_id=$1`,[f.id])).rows:[];
        journal.push({name,id,website,oldIdentity:old,evidence:spec.evidence});
        if(!existsSync(`${root}/supplement-before.json`))writeFileSync(`${root}/supplement-before.json`,JSON.stringify(journal,null,2));
        await db.query(`insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,categories,status,backbone_state,operating_status) values($1,$2,$3,$4,$5,$6,$7,array['restaurant'],'identity_only','published','open')`,[id,name,normalize(name),address,lat,lng,website]);
        await db.query(`insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active) values($1,'official_website',$2,$3,$4,$5,$6,$7,$8,1,$9::jsonb,now(),true)`,[id,key,spec.evidence,name,address,lat,lng,website,JSON.stringify({reason:spec.reason,coordinateSource:f?`Overture ${f.id}`:`same street address as ${spec.coordinateFrom}`,sourceClassification:f?.properties.taxonomy??null})]);
        if(old.length)await db.query(`update restaurant_identities set entity_id=$2 where provider='overture' and provider_id=$1`,[f.id,id]);
        await db.query(`insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active) values($1,$2,'founder_qa',now(),true)`,[market,id]);
        await db.query(`insert into restaurant_websites(entity_id,url,domain,source,active,updated_at) values($1,$2,$3,'founder_qa',true,now())`,[id,website,new URL(website).hostname]);
      }
      await db.query('commit');writeFileSync(`${root}/supplement.json`,JSON.stringify(journal,null,2));console.log(journal.map(({name,id,status})=>({name,id,status})));
    }
    if(process.argv.includes('--measure')){
      const rows=(await db.query(`select e.id,e.name,e.address,e.lat,e.lng,e.website,e.categories,e.operating_status,e.backbone_state,r.place_id,r.slug,r.status,
        (select count(*)::int from menu_items x where x.restaurant_id=r.place_id and x.active) menu_items,
        (select count(*)::int from photos x where x.restaurant_id=r.place_id and x.active and x.is_orderable and x.dedupe_reason is null) photos,
        (select count(*)::int from photos x where x.restaurant_id=r.place_id and x.active and x.is_orderable and x.dedupe_reason is null and x.menu_item_id is not null) matched_photos
        from restaurant_entities e join acquisition_market_entities m on m.entity_id=e.id and m.market_key=$1 and m.active left join restaurants r on r.entity_id=e.id order by e.name`,[market])).rows;
      const live=rows.filter(r=>r.place_id&&r.status!=='inactive');
      const totals={identified:entities.length,live:live.length,websites:live.filter(r=>r.website).length,menus:live.filter(r=>r.menu_items>0).length,withPhotos:live.filter(r=>r.photos>0).length,menuItems:live.reduce((n,r)=>n+r.menu_items,0),photos:live.reduce((n,r)=>n+r.photos,0),matchedPhotos:live.reduce((n,r)=>n+r.matched_photos,0)};
      writeFileSync(`${root}/measured.json`,JSON.stringify({at:new Date().toISOString(),totals,rows},null,2));console.log(totals);
    }
    if(process.argv.includes('--staged')){
      const groups=(await db.query(`select e.id,e.name,o.source_key,count(*)::int items,count(*) filter(where o.image_url is not null)::int photos,
        array_agg(distinct o.evidence_url) urls,array_agg(distinct o.extraction_method) methods,
        array(select p->>'finalUrl' from website_crawl_v3_results v cross join lateral jsonb_array_elements(v.route_evidence->'pages') p where v.entity_id=e.id and p->>'locationProof' is not null) proven_urls
        from website_menu_observations o join restaurant_entities e on e.id=o.entity_id
        where o.active and o.confidence>=0.78 and exists(select 1 from acquisition_market_entities m where m.entity_id=e.id and m.market_key=$1 and m.active)
        and exists(select 1 from restaurants r where r.entity_id=e.id and r.status='active') group by e.id,e.name,o.source_key order by photos desc,items desc`,[market])).rows;
      writeFileSync(`${root}/staged-summary.json`,JSON.stringify(groups,null,2));console.log(JSON.stringify(groups,null,2));
    }
    if(process.argv.includes('--runs'))console.log((await db.query(`select id,status,leased_count,completed_count,item_count,metadata from website_crawl_v3_runs where market_key=$1 order by started_at desc limit 5`,[market])).rows);
    if(process.argv.includes('--asset-status'))console.log((await db.query(`select kind,status,count(*)::int jobs from website_asset_jobs where run_id in(select id from website_crawl_v3_runs where market_key=$1) group by kind,status order by kind,status`,[market])).rows);
    if(process.argv.includes('--manifest')){
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));
      const groups=[];
      for(const rule of config.reviewedMenus){
        const entity=entities.find(e=>e.name===rule.name);if(!entity)continue;
        const items=(await db.query(`select item_name name,item_description description,image_url "imageUrl",price,evidence_url "evidenceUrl",extraction_method method,confidence from website_menu_observations where entity_id=$1 and active and confidence>=0.78 and evidence_url=any($2::text[]) order by confidence desc,item_name`,[entity.id,rule.urls])).rows;
        if(items.length)groups.push({entityId:entity.id,name:entity.name,source:rule.source,identityEvidence:rule.reason,items:items.filter(i=>!(rule.exclude??[]).some((s:string)=>normalize(s)===normalize(i.name))&&!/(?:bottled water|water bottle|pepsi|starry|mountain dew|sweetened tea|sweet tea)/i.test(i.name)).map(i=>({item:{name:i.name,description:i.description,price:i.price,imageUrl:(rule.withholdPhotoNames??[]).some((s:string)=>normalize(s)===normalize(i.name))?undefined:i.imageUrl},evidenceUrl:i.evidenceUrl,confidence:i.confidence,method:i.method}))});
      }
      writeFileSync(`${root}/reviewed-manifest.json`,JSON.stringify({groups},null,2));console.log(groups.map(g=>({name:g.name,items:g.items.length,photos:g.items.filter(i=>i.item.imageUrl).length,names:g.items.map(i=>i.item.name)})));
    }
    if(process.argv.includes('--enforce-photo-review')){
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));const rejected:any[]=[];
      for(const rule of config.reviewedMenus){const e=entities.find(e=>e.name===rule.name);if(!e||!rule.withholdPhotoNames?.length)continue;
        rejected.push(...(await db.query(`select p.* from photos p join restaurants r on r.place_id=p.restaurant_id join menu_items m on m.id=p.menu_item_id where r.entity_id=$1 and p.source=$2 and p.active and regexp_replace(lower(m.name),'[^a-z0-9]+','','g')=any($3::text[])`,[e.id,rule.source,rule.withholdPhotoNames.map(normalize)])).rows);
      }
      if(rejected.length){if(!existsSync(`${root}/photo-review-before.json`))writeFileSync(`${root}/photo-review-before.json`,JSON.stringify(rejected,null,2),{flag:'wx'});await db.query(`update photos set active=false,is_orderable=false,dedupe_reason='manual_review_uncertain_dish_match' where id=any($1::bigint[])`,[rejected.map(p=>p.id)]);}
      console.log({withheldUncertainPhotoRows:rejected.map(p=>p.id)});
    }
    if(process.argv.includes('--reject-sites')){
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));
      for(const rule of config.invalidWebsites){const e=entities.find(e=>e.name===rule.name);if(!e)continue;
        const before:any={entity:e,reason:rule.reason};
        for(const table of ['restaurant_websites','website_assets','website_menu_observations'])before[table]=(await db.query(`select * from ${table} where entity_id=$1`,[e.id])).rows;
        before.restaurants=(await db.query('select * from restaurants where entity_id=$1',[e.id])).rows;
        before.photos=(await db.query(`select p.* from photos p join restaurants r on r.place_id=p.restaurant_id where r.entity_id=$1`,[e.id])).rows;
        const file=`${root}/wrong-site-${e.id}.before.json`;if(!existsSync(file))writeFileSync(file,JSON.stringify(before,null,2),{flag:'wx'});
        await db.query('begin');
        await db.query(`update photos p set active=false,is_orderable=false,dedupe_reason='wrong_restaurant_website' from restaurants r where r.place_id=p.restaurant_id and r.entity_id=$1 and p.source not in ('user_upload','user_suggested')`,[e.id]);
        await db.query(`update restaurant_websites set active=false,updated_at=now() where entity_id=$1 and domain like $2`,[e.id,`%${rule.host}`]);
        await db.query(`update website_assets set active=false where entity_id=$1`,[e.id]);
        await db.query(`update website_menu_observations set active=false where entity_id=$1`,[e.id]);
        await db.query(`update restaurant_entities set backbone_state='quarantined',updated_at=now() where id=$1`,[e.id]);
        await db.query(`update restaurants r set status='inactive',updated_at=now() where entity_id=$1 and not exists(select 1 from photos p where p.restaurant_id=r.place_id and p.source in ('user_upload','user_suggested'))`,[e.id]);
        await db.query('commit');console.log({rejected:rule.name,reason:rule.reason});
      }
    }
    if(process.argv.includes('--correct-labels')){
      const config=JSON.parse(readFileSync('scripts/config/maple-grove-review.json','utf8'));
      const changes=config.labelCorrections.map((c:any)=>({...c,before:entities.find(e=>e.name===c.oldName)})).filter((c:any)=>c.before);
      if(!existsSync(`${root}/labels-before.json`))writeFileSync(`${root}/labels-before.json`,JSON.stringify(changes,null,2),{flag:'wx'});
      await db.query('begin');for(const c of changes){
        await db.query(`update restaurant_entities set name=$2,normalized_name=$3,address=coalesce($4,address),updated_at=now() where id=$1`,[c.before.id,c.name,normalize(c.name),c.address??null]);
        await db.query(`update restaurants set name=$2,address=coalesce($3,address),updated_at=now() where entity_id=$1`,[c.before.id,c.name,c.address??null]);
      }await db.query('commit');console.log(changes.map((c:any)=>({from:c.oldName,to:c.name})));
    }
    if(process.argv.includes('--photo-review')){
      const manifest=JSON.parse(readFileSync(`${root}/reviewed-manifest.json`,'utf8'));
      const photos=manifest.groups.flatMap((g:any)=>g.items.filter((e:any)=>e.item.imageUrl).map((e:any)=>({restaurant:g.name,dish:e.item.name,url:e.item.imageUrl})));
      const unique=[...new Map<string,any>(photos.map((p:any)=>[p.url,p])).values()];
      let cursor=0;const thumbs:Buffer[]=[];const rejected:string[]=[];
      await Promise.all(Array.from({length:6},async()=>{while(cursor<unique.length){const i=cursor++,p=unique[i];try{
        const r=await fetch(p.url,{signal:AbortSignal.timeout(15000)});if(!r.ok||!r.headers.get('content-type')?.startsWith('image/'))throw new Error('not image');const bytes=Buffer.from(await r.arrayBuffer());const stats=await sharp(bytes).stats();if(stats.channels.every(c=>c.stdev<2))throw new Error('blank');
        const label=Buffer.from(`<svg width="180" height="25"><rect width="180" height="25" fill="white"/><text x="4" y="17" font-size="11">${i}: ${p.dish.slice(0,22).replace(/[<>&]/g,' ')}</text></svg>`);
        thumbs[i]=await sharp({create:{width:180,height:155,channels:3,background:'white'}}).composite([{input:await sharp(bytes).resize(180,130,{fit:'contain',background:'#222'}).jpeg().toBuffer(),left:0,top:0},{input:label,left:0,top:130}]).jpeg().toBuffer();
      }catch{rejected.push(p.url);thumbs[i]=await sharp({create:{width:180,height:155,channels:3,background:'#555'}}).jpeg().toBuffer();}}}));
      for(let start=0;start<thumbs.length;start+=48){const cells=thumbs.slice(start,start+48);await sharp({create:{width:1080,height:Math.ceil(cells.length/6)*155,channels:3,background:'#111'}}).composite(cells.map((input,i)=>({input,left:i%6*180,top:Math.floor(i/6)*155}))).jpeg().toFile(`${root}/review-${start}.jpg`);}
      writeFileSync(`${root}/photo-review.json`,JSON.stringify({unique,rejected},null,2));console.log({photos:unique.length,rejected:rejected.length});
    }
  }finally{await db.end();}
}
main().catch(e=>{console.error(e);process.exitCode=1;});
