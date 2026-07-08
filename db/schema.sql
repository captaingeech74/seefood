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
  tier               int default 2,        -- 1 = menu-matched/pre-labeled, 2 = AI-identified, 3 = low-confidence
  gemini_label      text,
  is_orderable      boolean default true,
  width             int,
  height            int,
  created_at        timestamptz default now()
);

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

create index if not exists idx_menu_items_restaurant on menu_items(restaurant_id);
create index if not exists idx_photos_restaurant on photos(restaurant_id);
create index if not exists idx_photos_menu_item on photos(menu_item_id);
create index if not exists idx_source_runs_restaurant on source_runs(restaurant_id);
create index if not exists idx_source_runs_source_ts on source_runs(source, ts desc);
create index if not exists idx_restaurants_geo on restaurants(lat, lng);
