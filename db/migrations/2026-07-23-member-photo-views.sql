alter table photos add column if not exists view_count integer not null default 0;

alter table app_events drop constraint if exists app_events_event_name_check;
alter table app_events
  add constraint app_events_event_name_check
  check (event_name in ('app_open', 'love', 'share', 'photo_add', 'photo_view'));

create or replace function increment_photo_view(p_photo_id bigint)
returns void
language sql
security definer
set search_path = public
as $$
  update photos
  set view_count = view_count + 1
  where id = p_photo_id and active;
$$;
