create table if not exists profiles (
  user_id text primary key,
  display_name text not null default '',
  monthly_income_pence integer not null default 0,
  currency text not null default 'GBP',
  city text not null default '',
  payday smallint,
  onboarded boolean not null default false,
  notify_alerts boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists transactions (
  id text primary key,
  user_id text not null,
  merchant text not null,
  amount_pence integer not null,
  category text not null,
  spent_on date not null,
  source text not null,
  has_receipt boolean not null default false,
  note text not null default '',
  items_json text not null default '[]',
  image_data text,
  raw_alert text not null default '',
  is_sample boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_spent_idx
  on transactions (user_id, spent_on desc);

create table if not exists wallet_alerts (
  id text primary key,
  user_id text not null,
  raw_text text not null,
  merchant text not null default '',
  amount_pence integer,
  suggested_category text not null default 'other',
  confidence real not null default 0,
  status text not null default 'pending',
  created_at timestamptz not null default now()
);

create index if not exists wallet_alerts_user_idx
  on wallet_alerts (user_id, created_at desc);

create table if not exists advice_cache (
  user_id text not null,
  fingerprint text not null,
  body text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, fingerprint)
);
