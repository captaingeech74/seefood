-- Bounded Carlsbad rollout using the same national Census + Overture process
-- as every future U.S. city. No county-specific logic or paid data source.
insert into acquisition_markets(
  market_key,name,market_type,bounds,boundary_url,country_code,state_code,
  rollout_order,status
) values (
  'carlsbad-ca','Carlsbad, California','city',
  '{"west":-117.408,"south":33.061,"east":-117.205,"north":33.215}'::jsonb,
  'https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATE%3D%2706%27%20AND%20BASENAME%3D%27Carlsbad%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
  'US','CA',30,'planned'
)
on conflict(market_key) do update set
  name=excluded.name,market_type=excluded.market_type,bounds=excluded.bounds,
  boundary_url=excluded.boundary_url,country_code=excluded.country_code,
  state_code=excluded.state_code,rollout_order=excluded.rollout_order,
  updated_at=now();
