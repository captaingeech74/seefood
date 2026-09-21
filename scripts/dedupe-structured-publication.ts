#!/usr/bin/env -S npx tsx
/** Collapse only newly imported responsive variants; keep original rows and
 * all dish links/provenance. Preview default. Backup written before mutation. */
import {readFileSync,readdirSync,writeFileSync,existsSync} from 'node:fs';
import pg from 'pg';
import {providerPhotoAssetKey} from '../src/lib/photoFingerprint';
async function main(){
  const dir='logs/structured-platforms-20260920/publication';
  for(const l of readFileSync('.env.local','utf8').split('\n')){const m=l.match(/^([A-Z0-9_]+)=(.*)$/);if(m&&!process.env[m[1]])process.env[m[1]]=m[2];}
  const snapshots=readdirSync(dir).filter(f=>f.endsWith('.done.json')).map(f=>JSON.parse(readFileSync(`${dir}/${f}`,'utf8')));
  const prior=new Set<number>();for(const f of readdirSync(dir).filter(f=>f.endsWith('.before.json')))for(const p of JSON.parse(readFileSync(`${dir}/${f}`,'utf8')).tables.photos)prior.add(Number(p.id));
  const db=new pg.Client({connectionString:process.env.DATABASE_URL?.replace('[YOUR-PASSWORD]',encodeURIComponent(process.env.SUPABASE_DB_PASSWORD??'')),ssl:{rejectUnauthorized:false}});await db.connect();
  try{
    const rows=(await db.query('select * from photos where restaurant_id=any($1::text[]) and active and is_orderable and dedupe_reason is null order by id',[[...new Set(snapshots.map(s=>s.placeId))]])).rows;
    const groups=new Map<string,any[]>();for(const row of rows){const key=providerPhotoAssetKey(row.origin_url??'');if(!key)continue;const k=row.restaurant_id+'|'+key;const list=groups.get(k)??[];list.push(row);groups.set(k,list);}
    const changes:any[]=[];
    for(const list of groups.values())if(list.length>1){const keep=list.find(p=>prior.has(Number(p.id)))??list[0];for(const p of list)if(p.id!==keep.id&&!prior.has(Number(p.id)))changes.push({row:p,keep:keep.id});}
    console.log(JSON.stringify({newlyImportedSizeVariants:changes.length,restaurants:new Set(changes.map(c=>c.row.restaurant_id)).size,apply:process.argv.includes('--apply')}));
    if(!process.argv.includes('--apply')||!changes.length)return;
    const backup='logs/structured-platforms-20260920/variant-cleanup-before.json';if(existsSync(backup))throw new Error('Cleanup backup exists; inspect before repeating');
    await db.query('begin');
    try{
      const ids=changes.map(c=>c.row.id);const origins=(await db.query('select * from photo_origins where photo_id=any($1::bigint[])',[ids])).rows;
      const links=(await db.query('select * from photo_menu_item_links where photo_id=any($1::bigint[])',[ids])).rows;
      writeFileSync(backup,JSON.stringify({changes,origins,links},null,2),{flag:'wx'});
      for(const c of changes){
        await db.query('insert into photo_menu_item_links(photo_id,menu_item_id,source) select $1,menu_item_id,source from photo_menu_item_links where photo_id=$2 on conflict(photo_id,menu_item_id) do nothing',[c.keep,c.row.id]);
        await db.query('update photo_origins set photo_id=$1 where photo_id=$2',[c.keep,c.row.id]);
        await db.query("update photos set active=false,duplicate_of_photo_id=$1,dedupe_reason='same_provider_asset_variant',deduped_at=now() where id=$2",[c.keep,c.row.id]);
      }
      await db.query('commit');
    }catch(error){await db.query('rollback');throw error;}
  }finally{await db.end();}
}main().catch(error=>{console.error(error);process.exitCode=1;});
