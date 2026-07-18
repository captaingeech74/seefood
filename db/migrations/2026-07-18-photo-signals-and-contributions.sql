alter table photos add column if not exists source_platform text;
alter table photos add column if not exists photo_author_type text;
alter table photos add column if not exists trust_label text;
alter table photos add column if not exists attribution_confidence numeric default 0.5;

alter table photos add column if not exists photo_quality_score numeric default 0;
alter table photos add column if not exists dish_popularity_score numeric default 0;
alter table photos add column if not exists is_hero_candidate boolean default false;
alter table photos add column if not exists is_storefront boolean default false;
alter table photos add column if not exists is_menu_photo boolean default false;
alter table photos add column if not exists comparison_ready boolean default false;

alter table photos add column if not exists contributor_id text;
alter table photos add column if not exists submitted_at timestamptz;
alter table photos add column if not exists moderation_status text default 'approved';
alter table photos add column if not exists duplicate_hash text;
alter table photos add column if not exists abuse_flags jsonb default '[]'::jsonb;

update photos
set
  source_platform = coalesce(source_platform, source),
  photo_author_type = case
    when source in ('user_upload', 'user_suggested') then 'customer'
    when source in ('doordash', 'grubhub', 'menufy', 'schema_org', 'toast', 'square', 'clover', 'chownow', 'olo', 'popmenu') then 'management'
    when attribution = 'owner' then 'management'
    when attribution = 'user' then 'customer'
    else 'unknown'
  end,
  attribution_confidence = case
    when source in ('user_upload', 'user_suggested') then 1
    when source in ('doordash', 'grubhub', 'menufy', 'schema_org', 'toast', 'square', 'clover', 'chownow', 'olo', 'popmenu') then 0.9
    when source = 'google' then 0.7
    else 0.5
  end,
  trust_label = case
    when source in ('user_upload', 'user_suggested') then 'seefood_photo'
    when source in ('doordash', 'grubhub', 'menufy', 'schema_org', 'toast', 'square', 'clover', 'chownow', 'olo', 'popmenu') or attribution = 'owner' then 'management_photo'
    when attribution = 'user' then 'customer_photo'
    when source = 'google' then 'google_photo'
    else 'web_photo'
  end,
  photo_quality_score = case
    when photo_quality_score > 0 then photo_quality_score
    else least(100,
      34
      + (4 - coalesce(tier, 3)) * 12
      + case when height > 0 and width::numeric / height between 0.72 and 1.8 then 8 else 3 end
      + case when source in ('user_upload', 'user_suggested') then 8 else 5 end
      + case when menu_item_id is not null then 8 else 0 end
    )
  end,
  submitted_at = case when source in ('user_upload', 'user_suggested') then coalesce(submitted_at, created_at) else submitted_at end,
  moderation_status = coalesce(moderation_status, 'approved'),
  abuse_flags = coalesce(abuse_flags, '[]'::jsonb);

with dish_counts as (
  select
    restaurant_id,
    coalesce(menu_item_id::text, lower(trim(gemini_label)), 'photo-' || id::text) as dish_key,
    count(*) as photo_count,
    bool_or(photo_author_type = 'management') as has_management,
    bool_or(photo_author_type = 'customer') as has_customer,
    greatest(0, least(100, count(*) * 7 + sum(coalesce(love_count, 0)) * 3 + sum(coalesce(primary_votes, 0)) * 4)) as popularity
  from photos
  group by restaurant_id, coalesce(menu_item_id::text, lower(trim(gemini_label)), 'photo-' || id::text)
)
update photos p
set
  dish_popularity_score = d.popularity,
  comparison_ready = d.has_management and d.has_customer,
  is_hero_candidate =
    p.is_orderable
    and not coalesce(p.is_storefront, false)
    and not coalesce(p.is_menu_photo, false)
    and coalesce(p.gemini_label, '') <> ''
    and p.photo_quality_score >= 55
from dish_counts d
where p.restaurant_id = d.restaurant_id
  and coalesce(p.menu_item_id::text, lower(trim(p.gemini_label)), 'photo-' || p.id::text) = d.dish_key;

create index if not exists idx_photos_author_type on photos(photo_author_type);
create index if not exists idx_photos_hero on photos(restaurant_id, is_hero_candidate, dish_popularity_score desc, photo_quality_score desc);
create index if not exists idx_photos_contributor on photos(contributor_id) where contributor_id is not null;
create index if not exists idx_photos_duplicate_hash on photos(restaurant_id, duplicate_hash) where duplicate_hash is not null;
