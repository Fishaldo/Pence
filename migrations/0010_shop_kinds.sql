-- What a shop sells, learned once from its name and kept for everyone:
-- "cakebox" → cakes. interest_id is null when the name gave no clue, so the
-- same name is not asked about again for a while.
create table if not exists shop_kinds (
  core text primary key,
  interest_id text,
  what text not null default '',
  checked_at timestamptz not null default now()
);
