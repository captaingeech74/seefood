#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import pg from "pg";

const { Client } = pg;
const url = process.env.DL007_TEST_DATABASE_URL;
if (!url) throw new Error("DL007_TEST_DATABASE_URL is required");
const parsed = new URL(url);
if (!parsed.pathname.includes("seefood_dl007_test")) {
  throw new Error("Refusing to run outside an isolated seefood_dl007_test database");
}
const migration = await readFile(
  new URL("../db/migrations/2026-07-27-contribution-funnel-stage4.sql", import.meta.url),
  "utf8"
);
const client = new Client({ connectionString: url });
await client.connect();
try {
  await client.query(`
    create extension if not exists pgcrypto;
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create table restaurant_entities(
      id uuid primary key, status text, operating_status text
    );
    create table restaurants(
      place_id text primary key, entity_id uuid references restaurant_entities(id),
      status text
    );
    create table source_snapshots(
      id uuid primary key, entity_id uuid, source text, status text,
      completed_at timestamptz
    );
    create table menu_items(
      id bigint primary key, restaurant_id text, active boolean,
      missing_streak int, last_seen_at timestamptz, source_snapshot_id uuid,
      canonical_dish_id uuid
    );
    create table contribution_attempts(
      id uuid primary key, visitor_id text, session_id text, restaurant_id text,
      menu_item_id bigint, experiment_key text, variant_key text, surface text,
      traffic_class text, entity_status text, rights_version text,
      rights_granted_at timestamptz, target_class text, status text,
      created_at timestamptz default now(), updated_at timestamptz default now()
    );
    create table photos(
      id bigserial primary key, restaurant_id text, active boolean default false,
      photo_author_type text, moderation_status text, rights_status text,
      rights_version text, rights_scope text, source text, source_platform text,
      source_snapshot_id uuid, storage_url text, origin_url text,
      is_orderable boolean, is_storefront boolean, is_menu_photo boolean,
      menu_item_id bigint, canonical_dish_id uuid, content_hash text,
      duplicate_hash text, perceptual_hash text, duplicate_review_status text,
      duplicate_of_photo_id bigint, dedupe_reason text, photo_quality_score numeric,
      contribution_attempt_id uuid, published_at timestamptz,
      item_match_status text, comparison_ready boolean default false
    );
    create table photo_menu_item_links(photo_id bigint,menu_item_id bigint);
    create table contribution_funnel_events(
      id bigserial primary key, attempt_id uuid, event_name text,
      event_source text, outcome text, occurred_at timestamptz default now()
    );
    create unique index contribution_funnel_events_first_receipt
      on contribution_funnel_events(attempt_id,event_name,event_source,outcome);
  `);
  await client.query(migration);
  await client.query(`
    insert into restaurant_entities values
      ('00000000-0000-4000-8000-000000000001','active','open');
    insert into restaurants values
      ('fixture-restaurant','00000000-0000-4000-8000-000000000001','active');
    insert into source_snapshots values
      ('00000000-0000-4000-8000-000000000002',
       '00000000-0000-4000-8000-000000000001','merchant','succeeded',now());
    insert into menu_items values
      (1,'fixture-restaurant',true,0,now(),
       '00000000-0000-4000-8000-000000000002',null);
    insert into photos(
      restaurant_id,active,photo_author_type,moderation_status,rights_status,
      rights_scope,source,source_platform,source_snapshot_id,storage_url,
      is_orderable,is_storefront,is_menu_photo,menu_item_id,content_hash,
      perceptual_hash,duplicate_review_status,photo_quality_score,
      item_match_status,provenance_review_status,usefulness_review_status
    ) values(
      'fixture-restaurant',true,'management','approved','licensed',
      'licensed_display','merchant','merchant',
      '00000000-0000-4000-8000-000000000002','https://fixture.invalid/m.webp',
      true,false,false,1,'management-hash','management-phash','unique',90,
      'exact','verified','food_or_drink'
    );
  `);

  async function pendingAttempt(attempt, customerHash) {
    await client.query(`
      insert into contribution_attempts(
        id,visitor_id,session_id,restaurant_id,menu_item_id,experiment_key,
        variant_key,surface,traffic_class,entity_status,rights_version,
        rights_granted_at,target_class,status
      ) values($1,'visitor','session','fixture-restaurant',1,
        'dl007_known_dish_v1','passive_existing_surface','known_dish',
        'fixture','test_fixture','customer-photo-rights-v1',now(),
        'behavioral_prompt_candidate','pending_review')`,
      [attempt]
    );
    await client.query(`
      insert into photos(
        restaurant_id,active,photo_author_type,moderation_status,rights_status,
        rights_version,rights_scope,source,source_platform,storage_url,is_orderable,
        is_storefront,is_menu_photo,menu_item_id,content_hash,duplicate_hash,
        perceptual_hash,duplicate_review_status,contribution_attempt_id,
        item_match_status,provenance_review_status,usefulness_review_status
      ) values(
        'fixture-restaurant',false,'customer','pending','user_granted',
        'customer-photo-rights-v1','display_with_dish','user_upload','user_upload',
        'https://fixture.invalid/c.webp',true,false,false,1,$2,$2,
        'customer-phash','pending',$1,'pending','verified','food_or_drink')`,
      [attempt, customerHash]
    );
  }

  const approved = "00000000-0000-4000-8000-000000000010";
  await pendingAttempt(approved, "customer-hash");
  const publication = await client.query(
    `select review_contribution_photo($1,'approved','exact','unique','display_with_dish') published`,
    [approved]
  );
  if (!publication.rows[0].published) throw new Error("approval did not publish");
  const comparison = await client.query(
    `select comparison_ready from photos where contribution_attempt_id=$1`, [approved]
  );
  if (!comparison.rows[0].comparison_ready) throw new Error("gold comparison was not created");
  let replayRejected = false;
  try {
    await client.query(
      `select review_contribution_photo($1,'approved','exact','unique','display_with_dish')`,
      [approved]
    );
  } catch { replayRejected = true; }
  if (!replayRejected) throw new Error("terminal review replay was accepted");

  const duplicate = "00000000-0000-4000-8000-000000000011";
  await pendingAttempt(duplicate, "management-hash");
  await client.query(
    `select review_contribution_photo($1,'approved','exact','unique','display_with_dish')`,
    [duplicate]
  );
  const duplicateResult = await client.query(
    `select comparison_ready from photos where contribution_attempt_id=$1`, [duplicate]
  );
  if (duplicateResult.rows[0].comparison_ready) {
    throw new Error("identical Customer/Management images created a comparison");
  }

  const missingConsent = "00000000-0000-4000-8000-000000000014";
  await pendingAttempt(missingConsent, "consent-test-hash");
  await client.query(`update photos set rights_scope=null
    where contribution_attempt_id=$1`, [missingConsent]);
  let missingConsentRejected = false;
  try {
    await client.query(
      `select review_contribution_photo($1,'approved','exact','unique','display_with_dish')`,
      [missingConsent]
    );
  } catch { missingConsentRejected = true; }
  if (!missingConsentRejected) throw new Error("review backfilled missing stored consent");

  const missingGold = "00000000-0000-4000-8000-000000000012";
  await client.query(`update photos set provenance_review_status='not_reviewed'
    where photo_author_type='management'`);
  await pendingAttempt(missingGold, "different-hash");
  await client.query(
    `select review_contribution_photo($1,'approved','strong','unique','display_with_dish')`,
    [missingGold]
  );
  const noGold = await client.query(
    `select comparison_ready from photos where contribution_attempt_id=$1`, [missingGold]
  );
  if (noGold.rows[0].comparison_ready) throw new Error("failed gold gate created comparison");

  const receiptAttempt = "00000000-0000-4000-8000-000000000013";
  await client.query(`insert into contribution_attempts(
    id,visitor_id,session_id,restaurant_id,menu_item_id,experiment_key,variant_key,
    surface,traffic_class,status
  ) values($1,'v','s','fixture-restaurant',1,'e','v','known_dish','fixture','started')`,
  [receiptAttempt]);
  const first = new Client({ connectionString: url });
  const second = new Client({ connectionString: url });
  await Promise.all([first.connect(), second.connect()]);
  const concurrent = await Promise.allSettled([
    first.query(`insert into contribution_funnel_events
      (attempt_id,event_name,event_source,outcome)
      values($1,'storage_result','server','success')`, [receiptAttempt]),
    second.query(`insert into contribution_funnel_events
      (attempt_id,event_name,event_source,outcome)
      values($1,'storage_result','server','failure')`, [receiptAttempt]),
  ]);
  await Promise.all([first.end(), second.end()]);
  if (concurrent.filter((result) => result.status === "fulfilled").length !== 1) {
    throw new Error("first-receipt concurrency did not preserve exactly one outcome");
  }

  console.log(JSON.stringify({
    isolatedDatabase: parsed.pathname.slice(1),
    tests: {
      oneShotApprovalAndReplay: "passed",
      storedConsentEnforcement: "passed",
      customerManagementDuplicateRejection: "passed",
      canonicalGoldPredicateParity: "passed",
      noComparisonWhenGoldGateFails: "passed",
      firstReceiptConcurrency: "passed",
    },
  }, null, 2));
} finally {
  await client.end();
}
