#!/usr/bin/env node
/** Read-only, entity-level campaign baseline/outcome. Artifacts contain public
 * restaurant records and operational IDs, never credentials or customer data. */
import fs from 'node:fs';
import path from 'node:path';
import pg from 'pg';

for (const line of fs.readFileSync('.env.local','utf8').split('\n')) {
  const match=line.match(/^([A-Z0-9_]+)=(.*)$/);
  if(match&&!process.env[match[1]])process.env[match[1]]=match[2];
}
const stage=process.argv[2]??'baseline';
if(!/^[a-z0-9-]+$/.test(stage))throw new Error('Use a simple stage name');
const directory=path.resolve('logs/structured-platforms-20260920');
const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace('[YOUR-PASSWORD]',encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??'')),ssl:{rejectUnauthorized:false},application_name:'structured-platform-measurement'});
await db.connect();
try {
  await db.query('begin isolation level repeatable read read only');
  const entities=(await db.query(`
    with live as (
      select entity_id,min(name) name,array_agg(place_id order by place_id) place_ids
      from restaurants where status not in('inactive','test_fixture') and entity_id is not null group by entity_id
    ), menus as (
      select r.entity_id,count(*)::int rows,count(distinct coalesce(m.canonical_dish_id::text,lower(trim(m.name))))::int dishes
      from menu_items m join restaurants r on r.place_id=m.restaurant_id
      where m.active and r.status not in('inactive','test_fixture') group by r.entity_id
    ), photos as (
      select r.entity_id,count(*)::int rows,count(distinct coalesce(p.content_hash,p.origin_url,p.id::text))::int unique_photos,
        count(distinct coalesce(m.canonical_dish_id::text,lower(trim(m.name)))) filter(where m.active)::int pictured_dishes
      from photos p join restaurants r on r.place_id=p.restaurant_id left join menu_items m on m.id=p.menu_item_id
      where p.active and p.is_orderable and p.dedupe_reason is null and not p.is_storefront and r.status not in('inactive','test_fixture') group by r.entity_id
    )
    select l.*,coalesce(m.rows,0) menu_rows,coalesce(m.dishes,0) menu_dishes,
      coalesce(p.rows,0) photo_rows,coalesce(p.unique_photos,0) unique_photos,coalesce(p.pictured_dishes,0) pictured_dishes,
      array(select distinct unnest(cr.platforms) from website_crawl_v3_results cr where cr.entity_id=l.entity_id) platforms,
      array(select distinct a.market_key from acquisition_market_entities a where a.entity_id=l.entity_id and a.active and a.market_key<>'product-corpus-us' order by a.market_key) markets,
      (select coalesce(jsonb_agg(jsonb_build_object('id',w.id,'url',w.url,'domain',w.domain)),'[]'::jsonb) from restaurant_websites w where w.entity_id=l.entity_id and w.active) websites
    from live l left join menus m on m.entity_id=l.entity_id left join photos p on p.entity_id=l.entity_id order by l.entity_id
  `)).rows;
  const summary={entities:entities.length,withMenu:entities.filter(e=>e.menu_dishes>0).length,withPhotos:entities.filter(e=>e.unique_photos>0).length,
    withTenPicturedDishes:entities.filter(e=>e.pictured_dishes>=10).length,menuRows:entities.reduce((n,e)=>n+e.menu_rows,0),
    photoRows:entities.reduce((n,e)=>n+e.photo_rows,0),entityUniquePhotos:entities.reduce((n,e)=>n+e.unique_photos,0),picturedDishes:entities.reduce((n,e)=>n+e.pictured_dishes,0)};
  const platformSummary={};
  for(const e of entities)for(const platform of e.platforms){const s=platformSummary[platform]??={entities:0,zeroPhotos:0,underTenPicturedDishes:0};s.entities++;s.zeroPhotos+=Number(e.unique_photos===0);s.underTenPicturedDishes+=Number(e.pictured_dishes<10);}
  const output={snapshotAt:new Date().toISOString(),stage,summary,platformSummary,entities};
  await db.query('rollback');
  fs.mkdirSync(directory,{recursive:true});
  const filename=path.join(directory,`${stage}.json`);
  if(fs.existsSync(filename))throw new Error(`Refusing to overwrite ${filename}`);
  fs.writeFileSync(filename,JSON.stringify(output,null,2));
  console.log(JSON.stringify({file:filename,summary,platformSummary},null,2));
}finally{await db.end();}
