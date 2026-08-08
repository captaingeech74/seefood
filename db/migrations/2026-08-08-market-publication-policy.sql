-- Early-market publication policy: expose every confidently real restaurant,
-- regardless of content readiness, while excluding known closed/quarantined
-- identities. Publication actions are logged and reversible without deleting
-- restaurant, menu, photo, provenance, or contribution data.

create table if not exists market_publication_runs (
  id uuid primary key default gen_random_uuid(),
  market_key text not null references acquisition_markets(market_key),
  policy_version text not null,
  status text not null default 'running'
    check (status in ('running','completed','failed','rolled_back')),
  eligible_count int not null default 0,
  already_live_count int not null default 0,
  published_count int not null default 0,
  excluded_count int not null default 0,
  before_metrics jsonb not null default '{}'::jsonb,
  after_metrics jsonb not null default '{}'::jsonb,
  error_detail text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  rolled_back_at timestamptz
);

create index if not exists idx_market_publication_runs_market
  on market_publication_runs(market_key, started_at desc);

create table if not exists market_publication_actions (
  id bigint generated always as identity primary key,
  run_id uuid not null references market_publication_runs(id) on delete cascade,
  entity_id uuid not null references restaurant_entities(id),
  place_id text not null,
  action text not null check (action in ('created','reactivated')),
  before_restaurant jsonb,
  before_entity_status text,
  after_restaurant jsonb not null,
  created_at timestamptz not null default now(),
  unique(run_id, entity_id)
);

create index if not exists idx_market_publication_actions_run
  on market_publication_actions(run_id, id);

revoke all on market_publication_runs, market_publication_actions from anon, authenticated;

-- One canonical readiness definition for maps, restaurant cards, and reports.
create or replace function restaurant_product_readiness(
  p_place_ids text[],
  p_include_google_proxy boolean default false
) returns table(
  place_id text,
  menu_item_count bigint,
  dish_photo_count bigint,
  readiness text
) language sql stable security definer set search_path=public as $$
  with requested as (
    select unnest(coalesce(p_place_ids, '{}'::text[])) place_id
  ), menu_counts as (
    select mi.restaurant_id place_id,
      count(distinct lower(trim(mi.name))) menu_item_count
    from menu_items mi join requested r on r.place_id=mi.restaurant_id
    where mi.active
    group by mi.restaurant_id
  ), photo_counts as (
    select p.restaurant_id place_id,
      count(distinct lower(trim(coalesce(mi.name,p.gemini_label,'__unnamed_'||p.id::text)))) dish_photo_count
    from photos p
    join requested r on r.place_id=p.restaurant_id
    left join menu_items mi on mi.id=p.menu_item_id and mi.active
    where p.active
      and coalesce(p.storage_url,p.origin_url,'')<>''
      and (p_include_google_proxy or coalesce(p.storage_url,p.origin_url,'') not like '/api/photo?%')
    group by p.restaurant_id
  )
  select r.place_id,
    coalesce(m.menu_item_count,0),
    coalesce(p.dish_photo_count,0),
    case
      when coalesce(m.menu_item_count,0)>0 and coalesce(p.dish_photo_count,0)>=7 then 'rich'
      when coalesce(m.menu_item_count,0)>0 or coalesce(p.dish_photo_count,0)>0 then 'partial'
      else 'shell'
    end readiness
  from requested r
  left join menu_counts m using(place_id)
  left join photo_counts p using(place_id)
$$;

revoke all on function restaurant_product_readiness(text[],boolean) from public;
grant execute on function restaurant_product_readiness(text[],boolean) to service_role;

-- Founder-facing four-number market report. Neighborhood availability means
-- the share of known restaurant locations with at least five live choices
-- inside 1.5 km. Diagnostic funnels remain separate.
create or replace function market_product_scorecard(
  p_market_key text,
  p_include_google_proxy boolean default false
) returns jsonb language sql stable security definer set search_path=public as $$
  with eligible as (
    select distinct e.id,e.lat,e.lng
    from acquisition_market_entities m
    join restaurant_entities e on e.id=m.entity_id
    where m.market_key=p_market_key and m.active
      and e.backbone_state not in ('quarantined','rejected')
      and e.status not in ('inactive','rejected')
      and coalesce(e.operating_status,'')<>'permanently_closed'
      and e.lat is not null and e.lng is not null
  ), live as (
    select r.place_id,r.entity_id,r.lat,r.lng
    from restaurants r join eligible e on e.id=r.entity_id
    where r.status<>'inactive' and r.lat is not null and r.lng is not null
  ), ready as (
    select rr.* from restaurant_product_readiness(
      array(select place_id from live),p_include_google_proxy
    ) rr
  ), neighborhood as (
    select e.id,
      (select count(*) from live l
       where l.lat between e.lat-(1.5/111.0) and e.lat+(1.5/111.0)
         and l.lng between e.lng-(1.5/greatest(20.0,111.0*cos(radians(e.lat))))
                       and e.lng+(1.5/greatest(20.0,111.0*cos(radians(e.lat))))
         and 111.045*sqrt(
           power(l.lat-e.lat,2)+power((l.lng-e.lng)*cos(radians(e.lat)),2)
         )<=1.5) nearby_live
    from eligible e
  )
  select jsonb_build_object(
    'verifiedRestaurants',(select count(*) from eligible),
    'liveRestaurants',(select count(*) from live),
    'strongRestaurants',(select count(*) from ready where readiness='rich'),
    'neighborhoodCoverage',coalesce((select round(100.0*count(*) filter(where nearby_live>=5)/nullif(count(*),0),1) from neighborhood),0),
    'contributionOpportunities',(select count(*) from ready where readiness='shell'),
    'policy','show_all_not_known_closed_v1',
    'neighborhoodDefinition','5 live restaurants within 1.5 km'
  )
$$;

revoke all on function market_product_scorecard(text,boolean) from public;
grant execute on function market_product_scorecard(text,boolean) to service_role;
