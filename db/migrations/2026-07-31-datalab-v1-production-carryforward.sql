-- Carry forward the useful production lessons from DataLab 1.0 without
-- importing its research governance or unverified coverage claims.

alter table source_runs
  add column if not exists source_snapshot_id uuid references source_snapshots(id) on delete set null,
  add column if not exists provider_url text,
  add column if not exists response_hash text,
  add column if not exists failure_stage text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

alter table source_snapshots
  add column if not exists evidence_hash text,
  add column if not exists failure_stage text;

create index if not exists idx_source_runs_snapshot
  on source_runs(source_snapshot_id) where source_snapshot_id is not null;
create index if not exists idx_source_runs_response_hash
  on source_runs(source,response_hash) where response_hash is not null;
create index if not exists idx_source_snapshots_evidence_hash
  on source_snapshots(source,evidence_hash) where evidence_hash is not null;

alter table merchant_connections
  drop constraint if exists merchant_connections_provider_check;
alter table merchant_connections
  add constraint merchant_connections_provider_check check (
    provider in ('google_business','square','toast','clover','flipdish')
  );

-- The historical coverage_v2_metrics comparison field is a mechanical
-- Management/Customer label pairing. Preserve it as a diagnostic, but expose
-- only terminal-review-backed, still-current comparisons as comparisonCoverage.
create or replace function coverage_v2_verified_metrics(
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
with base as (
  select coverage_v2_metrics(
    p_min_lat,p_max_lat,p_min_lng,p_max_lng,
    p_lat,p_lng,p_radius_km,p_since
  ) metrics
), verified_entities as (
  select distinct r.entity_id
  from contribution_funnel_events event
  join contribution_attempts attempt on attempt.id = event.attempt_id
  join photos customer on customer.contribution_attempt_id = attempt.id
  join menu_items menu on menu.id = attempt.menu_item_id
  join restaurants r on r.place_id = attempt.restaurant_id
  join restaurant_entities entity on entity.id = r.entity_id
  where event.event_name = 'verified_comparison_created'
    and event.event_source = 'review'
    and event.outcome = 'created'
    and attempt.status = 'verified'
    and customer.active
    and customer.published_at is not null
    and customer.comparison_ready
    and menu.active
    and menu.restaurant_id = attempt.restaurant_id
    and r.status = 'active'
    and entity.status = 'active'
    and gold_management_counterpart(
      attempt.restaurant_id,attempt.menu_item_id,customer.id
    ) is not null
    and (
      (p_lat is null and p_min_lat is null)
      or (
        p_lat is not null and p_lng is not null and p_radius_km is not null
        and 6371 * 2 * asin(sqrt(
          power(sin(radians(entity.lat - p_lat) / 2), 2)
          + cos(radians(p_lat)) * cos(radians(entity.lat))
          * power(sin(radians(entity.lng - p_lng) / 2), 2)
        )) <= p_radius_km
      )
      or (
        p_min_lat is not null
        and entity.lat between p_min_lat and p_max_lat
        and entity.lng between p_min_lng and p_max_lng
      )
    )
)
select jsonb_set(
  jsonb_set(
    metrics,
    '{claimedComparisonCoverage}',
    coalesce(metrics->'comparisonCoverage','0'::jsonb),
    true
  ),
  '{comparisonCoverage}',
  to_jsonb((select count(*) from verified_entities)),
  true
)
from base
$$;

revoke all on function coverage_v2_verified_metrics(
  double precision,double precision,double precision,double precision,
  double precision,double precision,double precision,timestamptz
) from public, anon, authenticated;
grant execute on function coverage_v2_verified_metrics(
  double precision,double precision,double precision,double precision,
  double precision,double precision,double precision,timestamptz
) to service_role;
