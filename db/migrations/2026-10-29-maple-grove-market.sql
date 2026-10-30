-- Founder-requested Maple Grove city rollout. Census GEOID 2740166;
-- the polygon excludes neighboring Osseo, Plymouth, and Brooklyn Park.
insert into acquisition_markets(
  market_key,name,market_type,bounds,boundary_url,country_code,state_code,
  rollout_order,status
) values(
  'maple-grove-mn','Maple Grove, Minnesota','city',
  '{"west":-93.528454,"south":45.064700,"east":-93.400694,"north":45.152912}'::jsonb,
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATE%3D%2727%27%20AND%20BASENAME%3D%27Maple%20Grove%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
  'US','MN',60,'planned'
) on conflict(market_key) do nothing;
