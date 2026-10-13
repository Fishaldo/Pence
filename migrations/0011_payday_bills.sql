-- Payday, bills and the week: the features agreed for the commercial app that
-- need no outside accounts, brought to Pence for testing.

-- The location question is asked once after the first sign-in. People who set
-- up before it existed are not asked again.
alter table profiles add column if not exists location_asked boolean not null default false;
update profiles set location_asked = true where onboarded = true;

-- The day of the week for the weekly check-in: 0 is Sunday. Null means none.
alter table profiles add column if not exists weekly_day smallint;

-- Take-home for each pay period, confirmed or changed by the person, or
-- spotted from pay coming in on a statement and then confirmed.
create table if not exists pay_periods (
  user_id text not null,
  starts_on date not null,
  take_home_pence integer not null,
  source text not null default 'confirmed',
  created_at timestamptz not null default now(),
  primary key (user_id, starts_on)
);

-- When a bill's contract or deal ends, if the person told Pence.
alter table regulars add column if not exists contract_end date;

-- One-tap answers: what a spend at a shop that sells many things was.
-- '' is not asked yet, '-' is "rather not say", anything else is an interest id.
alter table transactions add column if not exists kind text not null default '';

-- The person's budget lines, used for every pay period.
create table if not exists budget_lines (
  id text primary key,
  user_id text not null,
  name text not null default '',
  category text,
  amount_pence integer not null,
  never_cut boolean not null default false,
  position smallint not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists budget_lines_user_idx on budget_lines (user_id, position);
