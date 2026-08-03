-- National acquisition backbone. Every import is versioned and reversible;
-- ambiguous identity changes are proposals, not silent merges.

alter table restaurant_entities
  add column if not exists backbone_state text not null default 'published'
    check (backbone_state in ('review', 'published', 'quarantined', 'rejected'));

alter table restaurant_identities
  add column if not exists source_release text,
  add column if not exists source_record_version text,
  add column if not exists raw_fingerprint text,
  add column if not exists last_import_batch_id uuid;

create table if not exists acquisition_markets (
  market_key text primary key,
  name text not null,
  market_type text not null check (market_type in ('city', 'metro', 'county', 'state', 'nationwide')),
  bounds jsonb not null,
  boundary_url text,
  state_code text,
  rollout_order int not null default 100,
  status text not null default 'planned'
    check (status in ('planned', 'backbone_loading', 'backbone_ready', 'enriching', 'ready', 'paused')),
  target_identity_count int,
  last_backbone_release text,
  last_backbone_sync_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table acquisition_markets add column if not exists boundary_url text;

insert into acquisition_markets(market_key,name,market_type,bounds,state_code,rollout_order,status) values
  ('temecula-ca','Temecula, California','city',
   '{"west":-117.22,"south":33.43,"east":-117.06,"north":33.59}'::jsonb,'CA',1,'backbone_loading'),
  ('san-diego-metro-ca','San Diego Metro, California','metro',
   '{"west":-117.35,"south":32.53,"east":-116.85,"north":33.15}'::jsonb,'CA',2,'planned'),
  ('san-diego-county-ca','San Diego County, California','county',
   '{"west":-117.61,"south":32.52,"east":-116.08,"north":33.51}'::jsonb,'CA',3,'planned')
on conflict(market_key) do update set
  name=excluded.name, market_type=excluded.market_type, bounds=excluded.bounds,
  state_code=excluded.state_code, rollout_order=excluded.rollout_order, updated_at=now();

update acquisition_markets set boundary_url =
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=BASENAME%3D%27Temecula%27&outFields=GEOID%2CNAME&outSR=4326&f=geojson'
where market_key='temecula-ca';

create table if not exists acquisition_import_batches (
  id uuid primary key default gen_random_uuid(),
  source text not null,
  source_release text not null,
  scope_key text not null references acquisition_markets(market_key),
  mode text not null default 'review' check (mode in ('review', 'publish')),
  status text not null default 'running'
    check (status in ('running', 'completed', 'failed', 'rolled_back')),
  input_sha256 text,
  input_record_count int not null default 0,
  eligible_record_count int not null default 0,
  existing_identity_count int not null default 0,
  matched_entity_count int not null default 0,
  created_entity_count int not null default 0,
  quarantined_count int not null default 0,
  website_count int not null default 0,
  error_detail text,
  metadata jsonb not null default '{}'::jsonb,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz,
  unique(source, source_release, scope_key, input_sha256)
);

create index if not exists idx_acquisition_import_batches_scope
  on acquisition_import_batches(scope_key, started_at desc);

create table if not exists acquisition_batch_changes (
  id bigint generated always as identity primary key,
  batch_id uuid not null references acquisition_import_batches(id) on delete cascade,
  entity_id uuid references restaurant_entities(id) on delete set null,
  provider text not null,
  provider_id text not null,
  action text not null check (action in ('entity_created', 'identity_inserted', 'identity_updated', 'website_queued', 'proposal_created')),
  before_state jsonb,
  after_state jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_acquisition_batch_changes_batch
  on acquisition_batch_changes(batch_id, id);

create table if not exists restaurant_field_observations (
  id bigint generated always as identity primary key,
  batch_id uuid references acquisition_import_batches(id) on delete set null,
  entity_id uuid references restaurant_entities(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  source_release text not null,
  field_name text not null,
  field_value jsonb not null,
  confidence numeric,
  license_id text,
  observed_at timestamptz not null,
  created_at timestamptz not null default now(),
  unique(provider, provider_id, source_release, field_name, field_value)
);

create index if not exists idx_restaurant_field_observations_entity
  on restaurant_field_observations(entity_id, field_name, observed_at desc);

create table if not exists identity_match_proposals (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references acquisition_import_batches(id) on delete cascade,
  provider text not null,
  provider_id text not null,
  proposed_entity_id uuid references restaurant_entities(id) on delete set null,
  disposition text not null check (disposition in ('match', 'new', 'review', 'quarantine', 'no_match')),
  reason_codes text[] not null default '{}',
  score numeric,
  distance_meters numeric,
  evidence jsonb not null default '{}'::jsonb,
  review_status text not null default 'pending'
    check (review_status in ('pending', 'accepted', 'rejected', 'superseded')),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  unique(batch_id, provider, provider_id)
);

create index if not exists idx_identity_match_proposals_review
  on identity_match_proposals(review_status, disposition, created_at);

create table if not exists acquisition_market_entities (
  market_key text not null references acquisition_markets(market_key) on delete cascade,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  source text not null,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  active boolean not null default true,
  primary key(market_key, entity_id, source)
);

create index if not exists idx_acquisition_market_entities_entity
  on acquisition_market_entities(entity_id, active);

create table if not exists website_menu_observations (
  id bigint generated always as identity primary key,
  entity_id uuid not null references restaurant_entities(id) on delete cascade,
  website_id uuid not null references restaurant_websites(id) on delete cascade,
  crawl_job_id uuid references web_crawl_jobs(id) on delete set null,
  source_key text not null,
  item_name text not null,
  item_description text,
  image_url text,
  price numeric,
  item_fingerprint text not null,
  active boolean not null default true,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique(entity_id, source_key, item_fingerprint)
);

create index if not exists idx_website_menu_observations_entity
  on website_menu_observations(entity_id, active, source_key);

alter table web_crawl_jobs
  add column if not exists available_at timestamptz not null default now(),
  add column if not exists lease_token uuid,
  add column if not exists lease_expires_at timestamptz,
  add column if not exists last_http_status int,
  add column if not exists result_metadata jsonb not null default '{}'::jsonb;

create index if not exists idx_web_crawl_jobs_available
  on web_crawl_jobs(status, available_at, priority, created_at);

create or replace function lease_web_crawl_jobs(
  p_market_key text,
  p_limit int default 25,
  p_lease_minutes int default 20
) returns setof web_crawl_jobs
language plpgsql security definer set search_path=public as $$
declare
  v_token uuid := gen_random_uuid();
begin
  return query
  with candidates as (
    select j.id
    from web_crawl_jobs j
    join acquisition_market_entities me on me.entity_id=j.entity_id and me.market_key=p_market_key and me.active
    join restaurant_websites w on w.id=j.website_id
    join restaurant_entities e on e.id=j.entity_id
    where (j.status='queued' or (j.status='leased' and j.lease_expires_at < now()))
      and j.available_at <= now()
      and j.source='live'
    order by
      case
        when lower(e.name) ~ '(mcdonald|subway|starbucks|taco bell|wendy|chick-fil-a|it.?s just wings)' then 3
        when lower(e.name) ~ '(bistro|brasserie|steak|seafood|sushi|italian|mexican|restaurant|grill|tavern|dining)' then 0
        else 1
      end,
      case
        when w.domain ~ '(restaurantji|restaurantguru|gastrobars|cafes-city|mapquest|yelp|tripadvisor|yellowpages|foursquare|menupix|sirved|business\.site)$' then 3
        when w.domain ~ '(toasttab|menufy|chownow|olo|popmenu|bentobox|spothopper|slicelife|flipdish|clover|square)\.' then 0
        else 1
      end,
      j.priority, j.created_at
    for update skip locked
    limit greatest(1, least(p_limit, 250))
  )
  update web_crawl_jobs j set
    status='leased', lease_token=v_token,
    lease_expires_at=now()+make_interval(mins => greatest(5,least(p_lease_minutes,120))),
    leased_at=now(), attempts=j.attempts+1, updated_at=now()
  from candidates c where j.id=c.id
  returning j.*;
end;
$$;

revoke all on function lease_web_crawl_jobs(text,int,int) from public;
grant execute on function lease_web_crawl_jobs(text,int,int) to service_role;

create or replace function apply_overture_import_rows(
  p_batch_id uuid, p_release text, p_market_key text, p_mode text, p_rows jsonb
) returns void language plpgsql security definer set search_path=public as $$
declare r jsonb; v_entity uuid; v_before jsonb; v_website uuid; v_url text; v_field record;
begin
  for r in select value from jsonb_array_elements(p_rows) loop
    v_entity := (r->>'entityId')::uuid;
    if (r->>'disposition') in ('new','quarantine') then
      insert into restaurant_entities(id,name,normalized_name,address,lat,lng,website,status,categories,phone,socials,operating_status,overture_confidence,backbone_state)
      values(v_entity,r->>'name',trim(regexp_replace(lower(r->>'name'),'[^a-z0-9]+',' ','g')),r->>'address',(r->>'lat')::float8,(r->>'lng')::float8,
        r->'websites'->>0,'identity_only',array(select jsonb_array_elements_text(r->'categories')),r->>'phone',array(select jsonb_array_elements_text(r->'socials')),
        r->>'operatingStatus',(r->>'confidence')::numeric,case when r->>'disposition'='quarantine' then 'quarantined' when p_mode='publish' then 'published' else 'review' end)
      on conflict(id) do nothing;
      insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,after_state)
      values(p_batch_id,v_entity,'overture',r->>'providerId','entity_created',jsonb_build_object('name',r->>'name','lat',r->>'lat','lng',r->>'lng'));
    end if;
    select to_jsonb(i) into v_before from restaurant_identities i where provider='overture' and provider_id=r->>'providerId';
    insert into restaurant_identities(entity_id,provider,provider_id,provider_url,name,address,lat,lng,website,confidence,raw_metadata,last_seen_at,active,source_release,source_record_version,raw_fingerprint,last_import_batch_id)
    values(v_entity,'overture',r->>'providerId','https://explore.overturemaps.org/places/'||(r->>'providerId'),r->>'name',r->>'address',(r->>'lat')::float8,(r->>'lng')::float8,
      r->'websites'->>0,(r->>'confidence')::numeric,jsonb_build_object('categories',r->'categories','sources',r->'sources','phones',case when r->>'phone' is null then '[]'::jsonb else jsonb_build_array(r->>'phone') end,'socials',r->'socials'),
      now(),true,p_release,r->>'version',r->>'fingerprint',p_batch_id)
    on conflict(provider,provider_id) do update set entity_id=excluded.entity_id,name=excluded.name,address=excluded.address,lat=excluded.lat,lng=excluded.lng,
      website=excluded.website,confidence=excluded.confidence,raw_metadata=excluded.raw_metadata,last_seen_at=now(),active=true,source_release=excluded.source_release,
      source_record_version=excluded.source_record_version,raw_fingerprint=excluded.raw_fingerprint,last_import_batch_id=excluded.last_import_batch_id;
    insert into acquisition_batch_changes(batch_id,entity_id,provider,provider_id,action,before_state,after_state)
    values(p_batch_id,v_entity,'overture',r->>'providerId',case when v_before is null then 'identity_inserted' else 'identity_updated' end,v_before,
      jsonb_build_object('entity_id',v_entity,'fingerprint',r->>'fingerprint','release',p_release));
    for v_field in select * from jsonb_each(jsonb_build_object('name',r->'name','address',r->'address','website',r->'websites','phone',r->'phone',
      'operating_status',r->'operatingStatus','categories',r->'categories','source_lineage',r->'sources')) loop
      if v_field.value <> 'null'::jsonb and v_field.value <> '[]'::jsonb then
        insert into restaurant_field_observations(batch_id,entity_id,provider,provider_id,source_release,field_name,field_value,confidence,license_id,observed_at)
        values(p_batch_id,v_entity,'overture',r->>'providerId',p_release,v_field.key,v_field.value,(r->>'confidence')::numeric,
          (select string_agg(value,',') from jsonb_array_elements_text(r->'licenseIds')),now()) on conflict do nothing;
      end if;
    end loop;
    insert into acquisition_market_entities(market_key,entity_id,source,last_seen_at,active) values(p_market_key,v_entity,'overture',now(),true)
      on conflict(market_key,entity_id,source) do update set last_seen_at=now(),active=true;
    if r->'resolution' is not null and r->'resolution' <> 'null'::jsonb then
      insert into identity_match_proposals(batch_id,provider,provider_id,proposed_entity_id,disposition,reason_codes,score,distance_meters,evidence,review_status)
      values(p_batch_id,'overture',r->>'providerId',coalesce((r#>>'{resolution,evidence,candidateId}')::uuid,v_entity),r#>>'{resolution,disposition}',
        coalesce(array(select jsonb_array_elements_text(r#>'{resolution,evidence,reasonCodes}')),array['no_existing_match']),
        nullif(r#>>'{resolution,evidence,score}','')::numeric,nullif(r#>>'{resolution,evidence,distanceMeters}','')::numeric,r->'resolution',
        case when r#>>'{resolution,disposition}'='match' then 'accepted' else 'pending' end) on conflict(batch_id,provider,provider_id) do nothing;
    end if;
    for v_url in select jsonb_array_elements_text(r->'websites') loop
      insert into restaurant_websites(entity_id,url,domain,source,active,updated_at)
      values(v_entity,v_url,regexp_replace(lower((regexp_match(v_url,'^https?://(?:www\.)?([^/:]+)'))[1]),'^www\.',''),'overture',true,now())
      on conflict(entity_id,url) do update set active=true,updated_at=now() returning id into v_website;
      insert into web_crawl_jobs(entity_id,website_id,source,status,priority,available_at)
      values(v_entity,v_website,'live','queued',30,now()) on conflict(website_id,source) do update
        set status=case when web_crawl_jobs.status='completed' then web_crawl_jobs.status else 'queued' end,updated_at=now();
    end loop;
  end loop;
end; $$;

revoke all on function apply_overture_import_rows(uuid,text,text,text,jsonb) from public;
grant execute on function apply_overture_import_rows(uuid,text,text,text,jsonb) to service_role;
