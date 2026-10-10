create table if not exists places (
  id text primary key,
  user_id text not null,
  label text not null,
  town text not null default '',
  lat double precision,
  lng double precision,
  is_phone boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists places_user_idx on places (user_id, created_at);
