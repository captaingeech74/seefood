create table if not exists management_popular_items (
  restaurant_id text not null references restaurants(place_id) on delete cascade,
  menu_item_name text not null,
  popularity_rank smallint not null check (popularity_rank between 1 and 7),
  tagged_at timestamptz not null default now(),
  primary key (restaurant_id, popularity_rank),
  unique (restaurant_id, menu_item_name)
);

create index if not exists idx_management_popular_items_restaurant
  on management_popular_items(restaurant_id, popularity_rank);

create table if not exists management_menu_imports (
  id uuid primary key default gen_random_uuid(),
  restaurant_id text not null references restaurants(place_id) on delete cascade,
  page_count int not null default 0,
  extracted_item_count int not null default 0,
  published_item_count int not null default 0,
  page_urls text[] not null default '{}',
  status text not null default 'draft'
    check (status in ('draft', 'published', 'failed')),
  created_at timestamptz not null default now(),
  published_at timestamptz
);

create index if not exists idx_management_menu_imports_restaurant
  on management_menu_imports(restaurant_id, created_at desc);
