-- The description as it first came in (statement line, alert, or receipt), kept
-- when the person renames the payment, so fixes can apply to every payment like it.
alter table transactions add column if not exists description text not null default '';
update transactions set description = merchant where description = '';

alter table wallet_alerts add column if not exists description text not null default '';

-- A person's fixes: this description is this payee, in this category.
create table if not exists payee_rules (
  user_id text not null,
  desc_key text not null,
  merchant text not null,
  category text not null,
  created_at timestamptz not null default now(),
  primary key (user_id, desc_key)
);

-- Watchlist entries can name an item, a shop or place, or both.
alter table watches add column if not exists item text not null default '';
alter table watches add column if not exists shop text not null default '';
alter table watches add column if not exists kind text not null default '';
