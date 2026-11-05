-- ============================================================
-- game-station-delete-migration.sql
--
-- Run in the FUTSAL Supabase project (mmyjtvlnuizpwktpkuij), after
-- game-schema-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- The Settings screen could add a station but never remove one; a TV that was
-- retired could only be parked in maintenance. A hard delete would also have
-- failed: game.sessions.station_id references game.stations with the default
-- ON DELETE (NO ACTION), so any TV that had ever been used was undeletable.
--
-- sessions already snapshots station_name and tier onto every row, and Reports
-- and the timeline already tolerate a null station_id. So, as with products:
--   1. relax the FK to ON DELETE SET NULL - deleting a TV keeps every past
--      session and its takings, it just unlinks them from the removed row;
--   2. add game.delete_station(), superadmin-only, the single delete path.
-- It refuses while the TV has an active session: ending that session is the
-- operator's job, not a side effect of deleting the row.
-- ============================================================

do $$
begin
  if to_regclass('game.sessions') is null then
    raise exception 'game schema not found. Run game-schema-migration.sql first.';
  end if;
end $$;

-- ── 1. sessions.station_id -> ON DELETE SET NULL ────────────────────────────
do $$
declare
  v_con  text;
  v_rule "char";
begin
  select con.conname, con.confdeltype
    into v_con, v_rule
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'game'
     and rel.relname = 'sessions'
     and con.contype = 'f'
     and con.confrelid = 'game.stations'::regclass
     and (select attname
            from pg_attribute
           where attrelid = con.conrelid
             and attnum = con.conkey[1]) = 'station_id';

  if v_con is null then
    raise exception 'FK on game.sessions.station_id not found.';
  end if;

  -- confdeltype 'n' == SET NULL. Already done? Then this is a re-run, skip.
  if v_rule is distinct from 'n' then
    execute format('alter table game.sessions drop constraint %I', v_con);
    alter table game.sessions
      add constraint sessions_station_id_fkey
      foreign key (station_id) references game.stations (id) on delete set null;
  end if;
end $$;

-- ── 2. delete_station() ─────────────────────────────────────────────────────
create or replace function game.delete_station(p_id uuid)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  v_found uuid;
begin
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can change the floor plan.' using errcode = '42501';
  end if;

  -- Lock the row so a session cannot open on it between the check and delete.
  select id into v_found from game.stations where id = p_id for update;
  if v_found is null then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;

  if exists (select 1 from game.sessions where station_id = p_id and status = 'active') then
    raise exception 'This station has a session in progress. End it first.'
      using errcode = '23514';
  end if;

  delete from game.stations where id = p_id;
end $$;

revoke all on function game.delete_station(uuid) from public, anon;
grant execute on function game.delete_station(uuid) to authenticated;

notify pgrst, 'reload schema';

-- ── VERIFY (run by hand) ────────────────────────────────────────────────────
--   select conname, confdeltype from pg_constraint
--    where conrelid = 'game.sessions'::regclass and conname = 'sessions_station_id_fkey';  -- 'n'
--   select proname from pg_proc p join pg_namespace n on n.oid = p.pronamespace
--    where n.nspname = 'game' and proname = 'delete_station';
--   -- as a superadmin session: select game.delete_station('<unused station uuid>');
