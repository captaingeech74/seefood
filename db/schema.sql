-- SeeFood corpus schema (PRD §5.1). Metadata only — image bytes live in R2.
-- Idempotent: safe to re-run.

create table if not exists restaurants (
  place_id             text primary key,
  slug                 text unique,
  name                 text not null,
  lat                  double precision,
  lng                  double precision,
  address              text,
  website              text,
  status               text default 'active',
  last_crawled_at      jsonb default '{}'::jsonb,  -- per-source: { "menufy": "2026-07-06T...", ... }
  doordash_store_url   text,  -- cached DoorDash discovery result — never re-search once found
  created_at           timestamptz default now(),
  updated_at           timestamptz default now()
);

create table if not exists menu_items (
  id                bigint generated always as identity primary key,
  restaurant_id     text not null references restaurants(place_id) on delete cascade,
  name              text not null,
  description       text,
  price_captured    numeric,   -- captured for future use; NEVER displayed in the UI
  source            text not null,  -- 'website' | 'doordash' | 'grubhub' | 'menufy' | 'toast' | ...
  confidence        text default 'medium',  -- 'high' | 'medium' | 'low'
  created_at        timestamptz default now(),
  unique (restaurant_id, name, source)
);

create table if not exists photos (
  id                bigint generated always as identity primary key,
  restaurant_id     text not null references restaurants(place_id) on delete cascade,
  menu_item_id      bigint references menu_items(id) on delete set null,
  storage_url       text,        -- R2 URL once copied
  origin_url        text,        -- source URL (used until copied to R2)
  source            text not null,
  attribution       text default 'owner', -- 'owner' | 'user'
  source_platform   text,
  photo_author_type text, -- 'management' | 'customer' | 'unknown'
  trust_label       text,
  attribution_confidence numeric default 0.5,
  tier               int default 2,        -- 1 = menu-matched/pre-labeled, 2 = AI-identified, 3 = low-confidence
  gemini_label      text,
  is_orderable      boolean default true,
  width             int,
  height            int,
  love_count        int default 0,  -- "I Loved This" tap count (no accounts — dedup is per-browser via localStorage only)
  primary_votes     int default 0,  -- thumbs-up while browsing same-dish variants — promotes which photo represents the dish in the grid (see computePrimaryPhoto)
  photo_quality_score numeric default 0,
  dish_popularity_score numeric default 0,
  is_hero_candidate boolean default false,
  is_storefront     boolean default false,
  is_menu_photo     boolean default false,
  comparison_ready boolean default false,
  contributor_id   text,
  submitted_at      timestamptz,
  moderation_status text default 'approved',
  duplicate_hash   text,
  abuse_flags      jsonb default '[]'::jsonb,
  created_at        timestamptz default now()
);

alter table photos add column if not exists love_count int default 0;
alter table photos add column if not exists primary_votes int default 0;

create table if not exists source_runs (
  id                bigint generated always as identity primary key,
  restaurant_id     text not null references restaurants(place_id) on delete cascade,
  source            text not null,
  ts                timestamptz default now(),
  ok                boolean not null,
  item_count        int default 0,
  photo_count       int default 0,
  latency_ms        int,
  error              text
);

-- search_api_usage table (Google Custom Search budget tracking) was dropped —
-- the API is permanently closed to new customers, confirmed July 2026. See
-- DECISIONS.md "DoorDash discovery: Custom Search closed". If a stray table
-- exists from an earlier deploy, drop it:
drop table if exists search_api_usage;

-- Dedupe existing duplicate photo rows (savePhotos used a blind insert with no
-- uniqueness guard — every re-persist of an already-crawled restaurant
-- appended a full new copy of every photo. Confirmed live July 2026: Richie's
-- had 1000 rows for 221 unique photos, BJ's 244 rows for 222 unique. This is
-- what caused visibly duplicated dish photos in the grid, since the read path
-- had no ORDER BY and sliced an arbitrary, duplicate-weighted 20 rows. Keep
-- the lowest id (earliest, most likely to have a real menu_item_id link) per
-- (restaurant_id, origin_url) group; idempotent, safe to re-run.
delete from photos a using photos b
  where a.id > b.id
    and a.restaurant_id = b.restaurant_id
    and a.origin_url = b.origin_url;

create unique index if not exists uq_photos_restaurant_origin on photos(restaurant_id, origin_url);

create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_photos_restaurant on photos(restaurant_id);
create index if not exists idx_photos_menu_item on photos(menu_item_id);
create index if not exists idx_source_runs_restaurant on source_runs(restaurant_id);
create index if not exists idx_source_runs_source_ts on source_runs(source, ts desc);
create index if not exists idx_restaurants_geo on restaurants(lat, lng);
