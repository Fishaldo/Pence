create table if not exists watches (
  id text primary key,
  user_id text not null,
  what text not null,
  town text not null default '',
  target_pence integer,
  floor_pence integer,
  declines integer not null default 0,
  status text not null default 'watching',
  checked_at timestamptz,
  web_checked_at timestamptz,
  found_at timestamptz,
  closed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists watches_user_idx on watches (user_id, created_at desc);
create index if not exists watches_due_idx on watches (status, web_checked_at);

create table if not exists watch_offers (
  id text primary key,
  watch_id text not null,
  user_id text not null,
  title text not null,
  merchant text not null default '',
  url text not null,
  shop_url text not null default '',
  source text not null default '',
  code text not null default '',
  price_pence integer,
  monthly boolean not null default false,
  detail text not null default '',
  status text not null default 'new',
  found_at timestamptz not null default now()
);

create unique index if not exists watch_offers_url_idx on watch_offers (watch_id, url);
create index if not exists watch_offers_user_idx on watch_offers (user_id, watch_id);

create table if not exists push_subs (
  endpoint text primary key,
  user_id text not null,
  created_at timestamptz not null default now()
);

create index if not exists push_subs_user_idx on push_subs (user_id);

create table if not exists app_keys (
  name text primary key,
  value text not null,
  created_at timestamptz not null default now()
);
