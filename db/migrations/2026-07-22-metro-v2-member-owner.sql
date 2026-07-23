-- Product definitions for the Temecula proof-of-concept and V2 coverage funnel.
alter table merchant_claims drop constraint if exists merchant_claims_plan_check;
alter table merchant_claims drop constraint if exists merchant_claims_monthly_price_check;
alter table merchant_claims
  add constraint merchant_claims_plan_check check (plan in ('starter', 'standard', 'growth'));
alter table merchant_claims
  add constraint merchant_claims_monthly_price_check check (monthly_price in (9, 99, 499));

create index if not exists idx_photos_active_restaurant_canonical
  on photos(restaurant_id, canonical_dish_id) where active;
create index if not exists idx_menu_active_restaurant_canonical
  on menu_items(restaurant_id, canonical_dish_id) where active;

create or replace function coverage_v2_metrics(
  p_min_lat double precision default null,
  p_max_lat double precision default null,
  p_min_lng double precision default null,
  p_max_lng double precision default null,
  p_lat double precision default null,
  p_lng double precision default null,
  p_radius_km double precision default null,
  p_since timestamptz default now() - interval '7 days'
) returns jsonb
language sql
stable
security definer
set search_path = public
as $$
with scoped_entities as (
  select e.id
  from restaurant_entities e
  where e.status <> 'test_fixture'
    and e.lat is not null and e.lng is not null
    and (
      (p_lat is null and p_min_lat is null)
      or (
        p_lat is not null and p_lng is not null and p_radius_km is not null
        and 6371 * 2 * asin(sqrt(
          power(sin(radians(e.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(e.lat))
          * power(sin(radians(e.lng - p_lng) / 2), 2)
        )) <= p_radius_km
      )
      or (
        p_min_lat is not null and e.lat between p_min_lat and p_max_lat
        and e.lng between p_min_lng and p_max_lng
      )
    )
), scoped_restaurants as (
  select r.place_id, r.entity_id
  from restaurants r join scoped_entities e on e.id = r.entity_id
), menu_counts as (
  select r.entity_id,
    count(distinct coalesce(m.canonical_dish_id::text, 'menu-' || m.id::text)) filter (where m.active) as menu_count
  from scoped_restaurants r
  left join menu_items m on m.restaurant_id = r.place_id
  group by r.entity_id
), photo_base as (
  select r.entity_id, p.id, p.photo_author_type,
    coalesce(p.canonical_dish_id::text, case when p.menu_item_id is not null then 'menu-' || p.menu_item_id::text end) as dish_key,
    (p.canonical_dish_id is not null or p.menu_item_id is not null) as matched
  from scoped_restaurants r
  join photos p on p.restaurant_id = r.place_id
  where p.active and not coalesce(p.is_storefront, false) and not coalesce(p.is_menu_photo, false)
), photo_counts as (
  select entity_id,
    count(*) as photo_count,
    count(*) filter (where matched) as matched_photo_count,
    count(distinct dish_key) filter (where matched) as matched_dish_count
  from photo_base group by entity_id
), comparison_counts as (
  select entity_id, count(*) as comparison_dish_count
  from (
    select entity_id, dish_key
    from photo_base
    where dish_key is not null
    group by entity_id, dish_key
    having bool_or(photo_author_type = 'management') and bool_or(photo_author_type = 'customer')
  ) comparisons
  group by entity_id
), restaurant_rollup as (
  select e.id,
    coalesce(m.menu_count, 0) as menu_count,
    coalesce(p.photo_count, 0) as photo_count,
    coalesce(p.matched_photo_count, 0) as matched_photo_count,
    coalesce(p.matched_dish_count, 0) as matched_dish_count,
    coalesce(c.comparison_dish_count, 0) as comparison_dish_count
  from scoped_entities e
  left join menu_counts m on m.entity_id = e.id
  left join photo_counts p on p.entity_id = e.id
  left join comparison_counts c on c.entity_id = e.id
), scoped_events as (
  select a.*
  from app_events a
  where a.created_at >= p_since
    and (
      a.restaurant_id is null
      or exists (select 1 from scoped_restaurants r where r.place_id = a.restaurant_id)
    )
), visitor_first_seen as (
  select visitor_id, min(created_at) as first_seen
  from app_events
  where event_name = 'app_open'
  group by visitor_id
), period_visitors as (
  select distinct e.visitor_id
  from scoped_events e where e.event_name = 'app_open'
), activity as (
  select
    count(*) filter (where e.event_name = 'app_open') as visits,
    count(distinct e.visitor_id) filter (where e.event_name = 'app_open') as visitors,
    count(distinct e.visitor_id) filter (
      where e.event_name = 'app_open' and f.first_seen >= p_since
    ) as new_visitors,
    count(distinct e.metadata->>'sessionId') filter (
      where e.event_name = 'photo_add' and coalesce(e.metadata->>'sessionId', '') <> ''
    ) as upload_sessions,
    count(*) filter (where e.event_name = 'love') as loves
  from scoped_events e
  left join visitor_first_seen f on f.visitor_id = e.visitor_id
)
select jsonb_build_object(
  'identifiedRestaurants', (select count(*) from restaurant_rollup),
  'menuCoverage', (select count(*) from restaurant_rollup where menu_count >= 1),
  'basicPhotoCoverage', (select count(*) from restaurant_rollup where photo_count >= 7),
  'basicMenuPhotoCoverage', (select count(*) from restaurant_rollup where matched_photo_count >= 7),
  'twentyPercentMenuPhotoCoverage', (
    select count(*) from restaurant_rollup
    where menu_count > 0 and matched_photo_count >= 7
      and matched_dish_count >= ceil(menu_count * 0.2)
  ),
  'fiftyPercentMenuPhotoCoverage', (
    select count(*) from restaurant_rollup
    where menu_count > 0 and matched_photo_count >= 7
      and matched_dish_count >= ceil(menu_count * 0.5)
  ),
  'comparisonCoverage', (select count(*) from restaurant_rollup where comparison_dish_count >= 1),
  'visits', coalesce((select visits from activity), 0),
  'visitors', coalesce((select visitors from activity), 0),
  'newVisitors', coalesce((select new_visitors from activity), 0),
  'uploadSessions', coalesce((select upload_sessions from activity), 0),
  'loves', coalesce((select loves from activity), 0)
);
$$;

