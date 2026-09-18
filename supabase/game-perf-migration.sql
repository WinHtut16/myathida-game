-- ============================================================
-- game-perf-migration.sql
--
-- Three performance fixes to the game schema. Run in the FUTSAL Supabase
-- project (mmyjtvlnuizpwktpkuij), after every other supabase/game-*.sql file
-- in this directory (in particular after game-live-sessions-migration.sql,
-- which is the last of them to touch game.* policies) - and after a FIXED
-- game-corrections-migration.sql has been (re-)applied, since that is what
-- actually creates game.stock_movements' select policy correctly now (see
-- its own comment, and section 1 below).
--
-- IDEMPOTENT. Safe to re-run.
--
-- WRAPPED IN A SINGLE TRANSACTION. This is a shared project - futsal and
-- billiards are live businesses on it too - and it touches RLS on 7 tables.
-- Half-applied is worse than not-applied, so either every change here takes
-- effect together or the whole thing rolls back and nothing does.
--
-- WHAT THIS DOES NOT DO: it does not change what any policy admits. Every
-- ALTER POLICY below rewrites only HOW the existing boolean is evaluated
-- (once per query instead of once per row), never WHICH rows or accounts
-- pass. See the comment on each block for why that distinction holds.
--
-- Verified against db-tests/99-game-perf.sql (../PointSystem_AkoATP), run
-- with the whole suite: 260 passed, 0 failed.
-- ============================================================

-- Run in one transaction: this touches 7 tables' RLS policies on a project
-- shared with futsal and billiards, live businesses. Half-applied is worse
-- than not-applied - either every ALTER POLICY here takes effect together or
-- none of them do.
begin;

do $$
begin
  if to_regclass('game.sessions') is null then
    raise exception 'game schema not found. Run game-schema-migration.sql first.';
  end if;
  if to_regclass('game.stock_movements') is null then
    raise exception 'game.stock_movements not found. Run game-corrections-migration.sql first.';
  end if;
end $$;

-- ── 1. RLS: stop re-evaluating the staff/superadmin check per row ──────────
--
-- game.is_active_staff() and game.is_superadmin() are both `language sql
-- stable`, so Postgres CAN cache one evaluation per query instead of running
-- the function (and the has_app_access()/game.staff lookups inside it) once
-- per row scanned - but only if the planner can prove the call is the same
-- for every row. A bare `using (game.is_active_staff())` does not give it
-- that proof; `using ((select game.is_active_staff()))` does, by turning the
-- call into an initPlan the planner evaluates once and reuses as a constant.
-- This is Supabase's own documented pattern for exactly this situation.
--
-- Every policy below keeps its name, its command (select/all) and its roles
-- unchanged - ALTER POLICY cannot change any of those, only the expression -
-- so this cannot admit or deny anyone differently than before.

alter policy staff_select on game.staff
  using (id = auth.uid() or (select game.is_superadmin()));

alter policy staff_write_superadmin on game.staff
  using ((select game.is_superadmin()))
  with check ((select game.is_superadmin()));

alter policy stations_select on game.stations
  using ((select game.is_active_staff()));

alter policy stations_write_superadmin on game.stations
  using ((select game.is_superadmin()))
  with check ((select game.is_superadmin()));

alter policy pricing_select on game.pricing
  using ((select game.is_active_staff()));

alter policy pricing_write_superadmin on game.pricing
  using ((select game.is_superadmin()))
  with check ((select game.is_superadmin()));

alter policy products_select on game.products
  using ((select game.is_active_staff()));

alter policy products_write_superadmin on game.products
  using ((select game.is_superadmin()))
  with check ((select game.is_superadmin()));

-- sessions and order_lines have no write policy on purpose - writes go
-- through the SECURITY DEFINER functions, which bypass RLS after running
-- their own check. Only the select policy needs wrapping.
alter policy sessions_select on game.sessions
  using ((select game.is_active_staff()));

alter policy order_lines_select on game.order_lines
  using ((select game.is_active_staff()));

-- ROOT CAUSE FIXED at game-corrections-migration.sql:67 (its existence guard
-- now scopes by polrelid, not just polname - see the comment there for why
-- the unscoped version silently never created this policy on any database
-- where billiards, which uses the identical policy name, loads first). This
-- block is defense in depth, not a workaround: it still checks rather than
-- assumes, so that if game-perf-migration.sql is ever applied to a database
-- where the FIXED game-corrections-migration.sql has not yet been (re-)run -
-- production, right now, is exactly that database - this creates the policy
-- correctly instead of failing on an ALTER POLICY with nothing to alter.
do $$
begin
  if exists (
    select 1 from pg_policy
     where polname = 'stock_movements_select'
       and polrelid = 'game.stock_movements'::regclass
  ) then
    alter policy stock_movements_select on game.stock_movements
      using ((select game.is_active_staff()));
  else
    create policy stock_movements_select on game.stock_movements
      for select using ((select game.is_active_staff()));
  end if;
end $$;

-- ── 2. Missing indexes ───────────────────────────────────────────────────
--
-- Every one of these backs either a foreign key with an ON DELETE action
-- (Postgres does not index those automatically, so the delete/set-null scans
-- the child table) or a column a data-layer read filters or joins on.

-- sessions.created_by: FK to game.staff(id); the session-history "staff"
-- filter (src/lib/data/reports.ts, getSessionHistory) does
-- .eq("created_by", filters.staff).
create index if not exists idx_sessions_created_by on game.sessions (created_by);

-- order_lines.product_id: FK to game.products(id) on delete set null
-- (game-product-delete-migration.sql). Without an index, deleting a product
-- scans every order_line to null out the ones that referenced it.
create index if not exists idx_order_lines_product on game.order_lines (product_id);

-- stock_movements.session_id: FK to game.sessions(id) on delete set null.
-- Same shape as above - a session correction that touches this FK's target
-- would otherwise scan the whole ledger.
create index if not exists idx_stock_movements_session on game.stock_movements (session_id);

-- sessions.started_at: the station occupancy timeline (getStationTimeline)
-- filters on started_at (falling back to created_at only for legacy
-- typed-in rows with no started_at), via an .or(...) across both columns.
create index if not exists idx_sessions_started_at on game.sessions (started_at);

-- ── 3. game.current_staff(): one indexed row instead of the whole table ───
--
-- getCurrentUser() (src/lib/data/session.ts) currently gets its own identity
-- by fetching the ENTIRE staff directory (game.staff_directory(), a join
-- against every staff row) and finding its own id in the result, then makes
-- a second, separate call to game.is_superadmin(). This is a single-row
-- lookup on game.staff's primary key plus the same rank check, in one round
-- trip instead of two.
--
-- Gating matches staff_directory()'s behaviour exactly: that function's
-- `where game.is_active_staff()` is evaluated once and applied uniformly, so
-- a caller who is not active staff gets zero rows back, not a row with
-- everyone hidden except their own. current_staff() reproduces that: if the
-- caller is not active staff, or has no game.staff row at all, it returns no
-- rows - the same "no staff record" case getCurrentUser() already handles by
-- returning null.
--
-- NOT wired into the app by this migration. src/lib/data/session.ts keeps
-- calling staff_directory() + is_superadmin() until this RPC is applied to
-- production and the app is switched over in a separate change.
create or replace function game.current_staff()
returns table (
  id uuid,
  name text,
  active boolean,
  is_superadmin boolean
)
language sql stable security definer
set search_path = game, public as $$
  select s.id, s.name, s.active, game.is_superadmin() as is_superadmin
    from game.staff s
   where s.id = auth.uid()
     and game.is_active_staff();
$$;

revoke all on function game.current_staff() from public;
grant execute on function game.current_staff() to authenticated;

-- ── 4. game.report_summary(): the dashboard aggregation, in SQL ──────────
--
-- getReports() (src/lib/data/reports.ts) fetches up to 5000 closed sessions,
-- order_lines included, and reduces them in TypeScript: once over the whole
-- array for totals, once per day-bucket and once per hour-bucket (fixed by
-- src/lib/report-buckets.ts to one pass each, but still a full row fetch and
-- a full in-process aggregation on every render). This does the same
-- aggregation as one query, server-side, with no row cap - it does not need
-- one, since summing in Postgres does not carry the "how much JSON to hand a
-- Vercel function" cost that motivated ROW_CAP in the first place.
--
-- p_from / p_boundary carry the SAME Yangon-local window maths getReports()
-- already computes (yangonMidnight()) - this function does not recompute or
-- second-guess them, only aggregates within them. p_boundary null means "no
-- comparison window" (the "all" period); p_from null together with
-- p_boundary null means "no lower bound" (also "all" - from is otherwise
-- always earlier than boundary, covering the previous window too).
--
-- byDay's span mirrors the fix in report-buckets.ts: when p_boundary is set
-- (today/7d/30d), the span is exactly that window, ending today - the window
-- size the caller asked for, whether or not every day in it has sales. When
-- p_boundary is null ("all"), the span runs from the EARLIEST closed
-- session's Yangon day to today, not a count of distinct selling days - the
-- same bug getReports() had before report-buckets.ts fixed it.
--
-- NOT wired into the app by this migration, for the same reason as
-- current_staff() above.
create or replace function game.report_summary(p_from timestamptz, p_boundary timestamptz)
returns jsonb
language plpgsql stable security definer
set search_path = game, public as $$
declare
  v_span_start date;
  v_span_end date := (now() at time zone 'Asia/Yangon')::date;
  v_result jsonb;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run reports for the game shop.' using errcode = '42501';
  end if;

  if p_boundary is not null then
    v_span_start := (p_boundary at time zone 'Asia/Yangon')::date;
  else
    select coalesce(min((created_at at time zone 'Asia/Yangon')::date), v_span_end)
      into v_span_start
      from game.sessions
     where status = 'closed'
       and (p_from is null or created_at >= p_from);
  end if;

  with current_rows as (
    select *
      from game.sessions
     where status = 'closed'
       and (p_from is null or created_at >= p_from)
       and (p_boundary is null or created_at >= p_boundary)
  ),
  prior_rows as (
    select *
      from game.sessions
     where status = 'closed'
       and p_boundary is not null
       and (p_from is null or created_at >= p_from)
       and created_at < p_boundary
  ),
  totals as (
    select
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::int as sessions,
      coalesce(sum(playtime_total), 0)::numeric as playtime,
      coalesce(sum(snacks_total), 0)::numeric as snacks
    from current_rows
  ),
  previous_totals as (
    select
      coalesce(sum(total), 0)::numeric as revenue,
      count(*)::int as sessions,
      coalesce(sum(playtime_total), 0)::numeric as playtime,
      coalesce(sum(snacks_total), 0)::numeric as snacks
    from prior_rows
  ),
  days as (
    select generate_series(v_span_start, v_span_end, interval '1 day')::date as day
  ),
  by_day as (
    select
      to_char(d.day, 'YYYY-MM-DD') as key,
      to_char(d.day, 'MM/DD') as label,
      coalesce(sum(cr.total), 0)::numeric as value
    from days d
    left join current_rows cr
      on (cr.created_at at time zone 'Asia/Yangon')::date = d.day
    group by d.day
    order by d.day
  ),
  hour_bounds as (
    select
      coalesce(min(extract(hour from (created_at at time zone 'Asia/Yangon'))::int), 10) as lo,
      coalesce(max(extract(hour from (created_at at time zone 'Asia/Yangon'))::int), 23) as hi
    from current_rows
  ),
  hours as (
    select generate_series(lo, hi) as h from hour_bounds
  ),
  by_hour as (
    select
      h.h::text as key,
      lpad(h.h::text, 2, '0') as label,
      coalesce(sum(cr.total), 0)::numeric as value
    from hours h
    left join current_rows cr
      on extract(hour from (cr.created_at at time zone 'Asia/Yangon'))::int = h.h
    group by h.h
    order by h.h
  ),
  by_station as (
    select station_name as key, station_name as label, sum(total)::numeric as value
      from current_rows
     group by station_name
     order by sum(total) desc
  ),
  top_snacks as (
    select
      ol.product_name as name,
      sum(ol.qty)::int as qty,
      sum(ol.line_total)::numeric as revenue
    from current_rows cr
    join game.order_lines ol on ol.session_id = cr.id
    group by ol.product_name
    order by sum(ol.qty) desc
    limit 5
  )
  select jsonb_build_object(
    'totals', jsonb_build_object(
      'revenue', t.revenue,
      'sessions', t.sessions,
      'playtime', t.playtime,
      'snacks', t.snacks,
      'avgPerSession', case when t.sessions > 0 then round(t.revenue / t.sessions) else 0 end
    ),
    'previous', case when p_boundary is null then null else jsonb_build_object(
      'revenue', pt.revenue,
      'sessions', pt.sessions,
      'playtime', pt.playtime,
      'snacks', pt.snacks,
      'avgPerSession', case when pt.sessions > 0 then round(pt.revenue / pt.sessions) else 0 end
    ) end,
    'byDay', coalesce((select jsonb_agg(jsonb_build_object('key', bd.key, 'label', bd.label, 'value', bd.value) order by bd.key) from by_day bd), '[]'::jsonb),
    'byHour', coalesce((select jsonb_agg(jsonb_build_object('key', bh.key, 'label', bh.label, 'value', bh.value) order by bh.key::int) from by_hour bh), '[]'::jsonb),
    'byStation', coalesce((select jsonb_agg(jsonb_build_object('key', bs.key, 'label', bs.label, 'value', bs.value) order by bs.value desc) from by_station bs), '[]'::jsonb),
    'topSnacks', coalesce((select jsonb_agg(jsonb_build_object('name', ts.name, 'qty', ts.qty, 'revenue', ts.revenue) order by ts.qty desc) from top_snacks ts), '[]'::jsonb)
  )
  into v_result
  from totals t, previous_totals pt;

  return v_result;
end;
$$;

revoke all on function game.report_summary(timestamptz, timestamptz) from public;
grant execute on function game.report_summary(timestamptz, timestamptz) to authenticated;

commit;
