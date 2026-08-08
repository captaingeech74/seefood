# Open map experiment

This is a reversible product experiment. It changes how the restaurant picker
is drawn, not how restaurants are identified or stored.

## Try it

Open restaurant search normally. The open map is now the default. Add
`?map=google` to force the established picker, or configure
`NEXT_PUBLIC_MAP_PROVIDER=google` to revert the whole deployment without a code
change. An explicit `?map=open` continues to override that environment switch.

The experimental picker uses MapLibre GL JS with OpenFreeMap's Liberty style.
It reads attached restaurants from SeeFood's existing `restaurants` table and
loads the same photo previews as the established picker.

## Identity rule

Google Place IDs are not being removed. SeeFood's restaurant record remains the
product identity currently used by the app, and its Google Place ID remains an
attached provider identity. Future Overture, official-website, DoorDash, and
Grubhub identifiers should reconcile onto that restaurant identity rather than
replace one another.

## Pelias

Pelias support is an optional server adapter. Configure `PELIAS_URL` (and, only
if the chosen service requires it, `PELIAS_API_KEY`) to add address,
neighborhood, and city autocomplete. With no URL configured, the route reports
that Pelias is unavailable and restaurant search continues normally.

SeeFood does not bundle or operate an Elasticsearch/Pelias cluster in V1. This
keeps the experiment light while preserving the integration seam if its search
quality proves useful.

## Remove it

1. Change `SeeFoodApp` back from `RestaurantPicker` to `MapPicker`.
2. Delete `RestaurantPicker.tsx`, `OpenMapPicker.tsx`, the optional geocoder
   route/library/test, and the open-map CSS rules.
3. Remove the MapLibre CSS import and `maplibre-gl` dependency.

No database migration or data rollback is necessary.
