-- Unified Website Acquisition V3. V3 uses the durable crawl lifecycle while
-- retaining source evidence and requiring explicit publication.

alter table web_crawl_jobs drop constraint if exists web_crawl_jobs_source_check;
alter table web_crawl_jobs add constraint web_crawl_jobs_source_check
  check(source in ('live','common_crawl','website_v3'));

create table if not exists website_crawl_v3_runs (
  id uuid primary key default gen_random_uuid(),
  market_key text not null references acquisition_markets(market_key),
  status text not null default 'running' check(status in ('running','completed','failed','cancelled')),
  collector_version text not null,
  configuration jsonb not null default '{}'::jsonb,
  leased_count int not null default 0,
  completed_count int not null default 0,
  empty_count int not null default 0,
  blocked_count int not null default 0,
  failed_count int not null default 0,
  restaurant_with_menu_count int not null default 0,
  item_count int not null default 0,
  menu_linked_photo_count int not null default 0,
  generic_photo_candidate_count int not null default 0,
  pdf_discovered_count int not null default 0,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz
);

create index if not exists idx_website_crawl_v3_runs_market
  on website_crawl_v3_runs(market_key,started_at desc);

create table if not exists website_crawl_v3_results (
  id bigint generated always as identity primary key,
  run_id uuid not null references website_crawl_v3_runs(id) on delete cascade,
  crawl_job_id uuid not null references web_crawl_jobs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  status text not null check(status in ('completed','empty','blocked','failed')),
  fetch_methods text[] not null default '{}',
  platforms text[] not null default '{}',
  page_count int not null default 0,
  item_count int not null default 0,
  generic_photo_candidate_count int not null default 0,
  menu_linked_photo_count int not null default 0,
  pdf_discovered_count int not null default 0,
  elapsed_ms int not null default 0,
  route_evidence jsonb not null default '{}'::jsonb,
  error_detail text,
  created_at timestamptz not null default now(),
  unique(run_id,website_id)
);

alter table website_menu_observations
  add column if not exists evidence_url text,
  add column if not exists extraction_method text,
  add column if not exists confidence numeric not null default 0.8,
  add column if not exists last_v3_run_id uuid references website_crawl_v3_runs(id) on delete set null,
  add column if not exists absent_successful_runs int not null default 0;

create table if not exists website_asset_jobs (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references website_crawl_v3_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  asset_url text not null,
  kind text not null check(kind in ('pdf','image')),
  menu_linked boolean not null default false,
  status text not null default 'queued' check(status in ('queued','leased','completed','failed','too_large','unsupported')),
  attempts int not null default 0,
  lease_token uuid,
  lease_expires_at timestamptz,
  available_at timestamptz not null default now(),
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(run_id,website_id,asset_url,kind)
);

create index if not exists idx_website_asset_jobs_queue
  on website_asset_jobs(run_id,status,available_at,kind);

create table if not exists website_asset_results (
  id bigint generated always as identity primary key,
  asset_job_id uuid not null references website_asset_jobs(id) on delete cascade,
  run_id uuid not null references website_crawl_v3_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  asset_url text not null,
  kind text not null check(kind in ('pdf','image')),
  status text not null,
  content_sha256 text,
  content_type text,
  byte_count int,
  page_count int,
  extraction_method text,
  extracted_item_count int not null default 0,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(asset_job_id)
);

drop function if exists queue_web_crawl_v3_market(text);
create or replace function queue_web_crawl_v3_market(p_market_key text,p_refresh boolean default false)
returns int language plpgsql security definer set search_path=public as $$
declare v_count int;
begin
  insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
  select w.entity_id,w.id,'website_v3','queued',
    case when w.domain ~ '(toasttab|menufy|chownow|olo|popmenu|bentobox|spothopper|slicelife|flipdish|clover|square)' then 10 else 30 end,
    now()
  from restaurant_websites w
  join acquisition_market_entities m on m.entity_id=w.entity_id and m.market_key=p_market_key and m.active
  where w.active
  on conflict(website_id,source) do update set
    status=case when p_refresh and not(web_crawl_jobs.status='leased' and web_crawl_jobs.lease_expires_at>now()) then 'queued' else web_crawl_jobs.status end,
    available_at=case when p_refresh then now() else web_crawl_jobs.available_at end,
    completed_at=case when p_refresh then null else web_crawl_jobs.completed_at end,
    last_error=case when p_refresh then null else web_crawl_jobs.last_error end,updated_at=now();
  get diagnostics v_count=row_count;
  return v_count;
end $$;

create or replace function lease_web_crawl_v3_jobs(p_market_key text,p_limit int default 25,p_lease_minutes int default 20)
returns setof web_crawl_jobs language plpgsql security definer set search_path=public as $$
declare v_token uuid := gen_random_uuid();
begin
  return query
  with candidates as (
    select j.id
    from web_crawl_jobs j
    join acquisition_market_entities m on m.entity_id=j.entity_id and m.market_key=p_market_key and m.active
    join restaurant_websites w on w.id=j.website_id and w.active
    where j.source='website_v3'
      and (j.status='queued' or (j.status='leased' and j.lease_expires_at<now()))
      and j.available_at<=now()
    order by j.priority,j.created_at
    for update skip locked
    limit greatest(1,least(p_limit,5000))
  )
  update web_crawl_jobs j set status='leased',lease_token=v_token,
    lease_expires_at=now()+make_interval(mins=>greatest(5,least(p_lease_minutes,120))),
    leased_at=now(),attempts=j.attempts+1,updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;

create or replace function lease_website_asset_jobs(p_run_id uuid,p_limit int default 25,p_lease_minutes int default 30)
returns setof website_asset_jobs language plpgsql security definer set search_path=public as $$
declare v_token uuid := gen_random_uuid();
begin
  return query
  with candidates as (
    select j.id from website_asset_jobs j
    where j.run_id=p_run_id and (j.status='queued' or (j.status='leased' and j.lease_expires_at<now())) and j.available_at<=now()
    order by case when j.kind='pdf' then 0 else 1 end,j.created_at
    for update skip locked limit greatest(1,least(p_limit,500))
  )
  update website_asset_jobs j set status='leased',lease_token=v_token,
    lease_expires_at=now()+make_interval(mins=>greatest(5,least(p_lease_minutes,120))),attempts=j.attempts+1,updated_at=now()
  from candidates c where j.id=c.id returning j.*;
end $$;

revoke all on function queue_web_crawl_v3_market(text,boolean) from public;
revoke all on function lease_web_crawl_v3_jobs(text,int,int) from public;
revoke all on function lease_website_asset_jobs(uuid,int,int) from public;
grant execute on function queue_web_crawl_v3_market(text,boolean) to service_role;
grant execute on function lease_web_crawl_v3_jobs(text,int,int) to service_role;
grant execute on function lease_website_asset_jobs(uuid,int,int) to service_role;

revoke all on website_crawl_v3_runs,website_crawl_v3_results,website_asset_jobs,website_asset_results from anon,authenticated;
