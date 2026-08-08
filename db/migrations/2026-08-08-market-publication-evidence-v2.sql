-- Keep early-market visibility broad without publishing unresolved permit or
-- business-shell records that have no consumer-facing restaurant evidence.

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
      and (
        e.backbone_state='published'
        or exists (
          select 1 from unnest(coalesce(e.categories,'{}'::text[])) category
          where category<>'restaurant' and (
            category like '%restaurant%' or category in (
              'bar','salad_bar','food_truck','coffee_shop','cafe','bakery',
              'ice_cream_shop','brewery','winery','pub','sandwich_shop'
            )
          )
        )
        or exists (
          select 1 from website_menu_observations w
          where w.entity_id=e.id and w.active and w.confidence>=0.78
        )
      )
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
    'policy','show_all_restaurant_evidence_v2',
    'neighborhoodDefinition','5 live restaurants within 1.5 km'
  )
$$;

revoke all on function market_product_scorecard(text,boolean) from public;
grant execute on function market_product_scorecard(text,boolean) to service_role;
