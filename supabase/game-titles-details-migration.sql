-- Richer game entries for the park's /games library: a short description in
-- each language, "local co-op" and "online" tags, and a Featured switch for
-- the spotlight at the top of the library.
--
-- Run AFTER game-titles-migration.sql. Adds nullable/defaulted columns only;
-- existing rows keep working. RLS and grants from game-titles-migration.sql
-- cover the new columns.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regclass('game.titles') is null then
    raise exception 'game-titles-migration.sql has not been applied. Nothing was changed.';
  end if;
end $$;

alter table game.titles add column if not exists description_en text;
alter table game.titles add column if not exists description_my text;
alter table game.titles add column if not exists local_coop boolean not null default false;
alter table game.titles add column if not exists online boolean not null default false;
alter table game.titles add column if not exists featured boolean not null default false;

alter table game.titles drop constraint if exists titles_description_en_len;
alter table game.titles add constraint titles_description_en_len
  check (description_en is null or char_length(description_en) <= 400);
alter table game.titles drop constraint if exists titles_description_my_len;
alter table game.titles add constraint titles_description_my_len
  check (description_my is null or char_length(description_my) <= 400);

comment on column game.titles.description_en is 'Short English description shown on the park /games page (<= 400 chars).';
comment on column game.titles.description_my is 'Short Burmese description shown on the park /games page (<= 400 chars).';
comment on column game.titles.local_coop is 'Two or more people can play together on one screen.';
comment on column game.titles.online is 'Has online play.';
comment on column game.titles.featured is 'Shown in the Featured spotlight at the top of the /games library.';

commit;
