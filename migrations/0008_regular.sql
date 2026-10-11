-- The keys a phone gives so alerts can carry their own words.
alter table push_subs add column if not exists p256dh text;
alter table push_subs add column if not exists auth text;

-- Regular payments the person added (key "m:…"), or changed (key "p:…" for one Pence found).
create table if not exists regulars (
  user_id text not null,
  key text not null,
  name text not null default '',
  amount_pence integer,
  freq text,
  next_due date,
  stopped boolean not null default false,
  stopped_on date,
  remind boolean not null default true,
  created_at timestamptz not null default now(),
  primary key (user_id, key)
);

-- One reminder per payment, per due date, per step (7, 3 and 1 days before).
create table if not exists reminders_sent (
  user_id text not null,
  key text not null,
  due date not null,
  days_before integer not null,
  sent_at timestamptz not null default now(),
  primary key (user_id, key, due, days_before)
);
