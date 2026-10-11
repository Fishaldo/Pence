-- What each shop on a statement really is, found once on the web and kept:
-- its real name, what it sells, whether it is a chain, a local business or an
-- online service, where it is, and its website. Kept per area, because
-- "Pizza & Co" near Birmingham is not the "Pizza & Co" in Leeds.
-- interest_id is null when the lookup found nothing, so it is not repeated
-- on every visit.
create table if not exists shop_kinds (
  core text not null,
  area text not null default 'uk',
  name text not null default '',
  what text not null default '',
  interest_id text,
  kind text not null default '',
  place text not null default '',
  site text not null default '',
  checked_at timestamptz not null default now(),
  primary key (core, area)
);
