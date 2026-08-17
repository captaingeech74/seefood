-- International market support, resort subvenues, and truthful portfolio
-- reporting for the Los Cabos rollout.

alter table acquisition_markets
  add column if not exists country_code text not null default 'US';

update acquisition_markets set country_code='US' where country_code is null;

insert into acquisition_markets(
  market_key,name,market_type,bounds,state_code,country_code,rollout_order,status
) values (
  'los-cabos-mx','Los Cabos, Baja California Sur','metro',
  '{"west":-109.99,"south":22.84,"east":-109.64,"north":23.10}'::jsonb,
  'BCS','MX',5,'planned'
) on conflict(market_key) do update set
  name=excluded.name,market_type=excluded.market_type,bounds=excluded.bounds,
  state_code=excluded.state_code,country_code=excluded.country_code,
  rollout_order=excluded.rollout_order,updated_at=now();

alter table restaurant_entities
  add column if not exists parent_entity_id uuid references restaurant_entities(id) on delete set null,
  add column if not exists venue_kind text not null default 'standalone'
    check (venue_kind in ('standalone','resort','resort_restaurant'));

create index if not exists idx_restaurant_entities_parent
  on restaurant_entities(parent_entity_id) where parent_entity_id is not null;

create or replace view restaurant_portfolio_reporting as
with active_market as (
  select entity_id,array_agg(distinct market_key order by market_key) market_keys
  from acquisition_market_entities where active group by entity_id
), duplicate_candidates as (
  select e.id,exists(
    select 1 from restaurant_entities other
    where other.id<>e.id
      and other.lat between e.lat-0.0001 and e.lat+0.0001
      and other.lng between e.lng-0.0001 and e.lng+0.0001
      and trim(regexp_replace(lower(other.name),'[^a-z0-9]+',' ','g'))=
          trim(regexp_replace(lower(e.name),'[^a-z0-9]+',' ','g'))
  ) probable_duplicate
  from restaurant_entities e
)
select e.id,e.name,e.status,e.backbone_state,e.lat,e.lng,
  coalesce(m.market_keys,'{}'::text[]) market_keys,
  case
    when e.lat is null or e.lng is null or (e.lat=0 and e.lng=0) then 'invalid'
    when d.probable_duplicate then 'probable_duplicate'
    when cardinality(coalesce(m.market_keys,'{}'::text[]))>0 then 'managed_market'
    when exists(select 1 from restaurants r where r.entity_id=e.id and r.status<>'inactive') then 'legacy_live_unassigned'
    else 'unassigned_inactive'
  end reporting_class
from restaurant_entities e
left join active_market m on m.entity_id=e.id
join duplicate_candidates d on d.id=e.id;

revoke all on restaurant_portfolio_reporting from anon,authenticated;
