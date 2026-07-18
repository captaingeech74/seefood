create table if not exists app_events (
  id            bigint generated always as identity primary key,
  event_name    text not null check (event_name in ('app_open', 'love', 'share', 'photo_add')),
  visitor_id    text not null,
  restaurant_id text references restaurants(place_id) on delete set null,
  metadata      jsonb default '{}'::jsonb,
  created_at    timestamptz default now()
);

create index if not exists idx_app_events_created_at on app_events(created_at desc);
create index if not exists idx_app_events_restaurant_created on app_events(restaurant_id, created_at desc);
create index if not exists idx_app_events_visitor_created on app_events(visitor_id, created_at desc);
