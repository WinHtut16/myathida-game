-- Games on the shelf: the list of titles customers can play, managed from the
-- game admin's Games screen and shown on the public park page (/games).
--
-- WHO CAN DO WHAT
--   Any active game staff (admin or superadmin): read, add, edit, hide, delete.
--   This is a display list, not money, so it is not superadmin-only like
--   prices and the snack catalogue.
--   The public page reads it server-side with the service role, visible rows
--   only (PointSystem_AkoATP lib/park/game-board.server.ts). anon gets nothing.
--
-- COVERS
--   cover_url must be a Cloudinary https URL (the admin uploads there); the
--   park page's CSP only allows images from res.cloudinary.com, so any other
--   host would show a broken image to customers.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('game.is_active_staff()') is null then
    raise exception 'game-schema-migration.sql has not been applied. Nothing was changed.';
  end if;
end $$;

create table if not exists game.titles (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (char_length(btrim(title)) between 1 and 80),
  platforms    text[] not null default array['PS5']
               check (cardinality(platforms) between 1 and 2 and platforms <@ array['PS4', 'PS5']),
  genre        text not null default 'other'
               check (genre in ('action', 'adventure', 'fighting', 'racing', 'sports', 'shooter',
                                'horror', 'party', 'family', 'rpg', 'other')),
  max_players  smallint not null default 1 check (max_players between 1 and 4),
  cover_url    text check (cover_url is null or cover_url like 'https://res.cloudinary.com/%'),
  is_new       boolean not null default false,
  is_popular   boolean not null default false,
  visible      boolean not null default true,
  sort_order   integer not null default 0,
  created_by   uuid default auth.uid(),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on table game.titles is
  'Games available to play at ACJ Gaming. Managed on the game admin Games screen; visible rows are shown on the public /games page.';

-- One row per game, however it was capitalised or spaced.
create unique index if not exists titles_title_unique on game.titles (lower(btrim(title)));
create index if not exists titles_visible_order on game.titles (visible, sort_order, title);

create or replace function game.titles_touch_updated_at()
returns trigger language plpgsql
set search_path = game, public as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists titles_touch_updated_at on game.titles;
create trigger titles_touch_updated_at
  before update on game.titles
  for each row execute function game.titles_touch_updated_at();

alter table game.titles enable row level security;

drop policy if exists titles_select on game.titles;
create policy titles_select on game.titles for select
  using (game.is_active_staff());

drop policy if exists titles_write_staff on game.titles;
create policy titles_write_staff on game.titles for all
  using (game.is_active_staff()) with check (game.is_active_staff());

-- The schema's default privileges grant everything to anon; RLS already
-- returns nothing to anon here, but say it outright.
revoke all on game.titles from anon;
grant select, insert, update, delete on game.titles to authenticated;
grant all on game.titles to service_role;

commit;
