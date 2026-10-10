create table if not exists habit_prefs (
  user_id text not null,
  habit_key text not null,
  mode text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, habit_key)
);
