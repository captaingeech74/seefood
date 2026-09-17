-- Expand the earlier two-restaurant travel-QA market to the complete current
-- Census incorporated-city boundary. Overture supplies the national backbone;
-- SRHD inspection records are used only as an independent completeness check.
update acquisition_markets set
  name='Spokane, Washington',
  market_type='city',
  bounds='{"west":-117.605,"south":47.586,"east":-117.303,"north":47.759}'::jsonb,
  boundary_url='https://tigerweb.geo.census.gov/arcgis/rest/services/TIGERweb/Places_CouSub_ConCity_SubMCD/MapServer/4/query?where=STATE%3D%2753%27%20AND%20BASENAME%3D%27Spokane%27&outFields=*&returnGeometry=true&outSR=4326&f=geojson',
  country_code='US',
  state_code='WA',
  rollout_order=50,
  status='planned',
  updated_at=now()
where market_key='spokane-wa';
