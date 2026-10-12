-- Database-side pin for the billing rule, matching src/lib/pricing.test.ts
-- boundary-for-boundary. src/lib/pricing.ts's own header comment and
-- pricing.test.ts's header comment both already asserted this file exists
-- and asserts the same table of boundaries - it did not exist until this
-- migration added it.
--
-- NOT WIRED INTO ANY RUNNER. This repo's package.json only has
-- `"test": "vitest run"`, which covers the TS half of the pair; there is no
-- SQL test harness (pgTAP or otherwise) configured. Run this by hand against
-- a database that already has every supabase/*.sql migration applied,
-- INCLUDING game-pricing-tiers-migration.sql:
--
--   psql "$SUPABASE_DB_URL" -v ON_ERROR_STOP=1 -f db-tests/97-game-live-sessions.sql
--
-- Confirm with the project owner where this should actually run (a staging
-- Supabase project, a throwaway container seeded from the migrations, or a
-- CI job) before relying on it as a gate - it is a correctness pin, not yet
-- a wired check.
--
-- Every block either succeeds silently or RAISEs with the expected vs. got
-- values, so a failure is loud and specific rather than a bare assertion
-- failure.

set search_path = game, public;

do $$
begin
  if to_regprocedure('game.tier_rate(numeric,jsonb)') is null
     or to_regprocedure('game.pricing_curve(text)') is null
     or to_regprocedure('game.replace_pricing_tiers(text,jsonb,int,int,int)') is null then
    raise exception 'game-pricing-tiers-migration.sql has not been applied. Nothing was checked.';
  end if;
end $$;

-- ── game.tier_rate() / game.pricing_curve() — the curve itself ─────────────
-- Mirrors src/lib/pricing.test.ts's "the pricing curve" describe block,
-- against the exact same fixture: 30->2500, 60->5000, 90->6500.

do $$
declare
  v_points jsonb := jsonb_build_array(
    jsonb_build_object('duration_minutes', 0,  'rate', 0),
    jsonb_build_object('duration_minutes', 30, 'rate', 2500),
    jsonb_build_object('duration_minutes', 60, 'rate', 5000),
    jsonb_build_object('duration_minutes', 90, 'rate', 6500)
  );
  v_cases jsonb := jsonb_build_array(
    jsonb_build_array('exact match at a configured point (90)', 90, 6500),
    jsonb_build_array('interpolates strictly between two points (47, between 30 and 60)', 47, 3917),
    jsonb_build_array('extrapolates beyond the highest point off the LAST segment''s slope (120)', 120, 8000),
    jsonb_build_array('interpolates below the lowest point against the implicit origin (10)', 10, 833),
    jsonb_build_array('exact boundary shared by two adjacent segments agrees either way (60)', 60, 5000)
  );
  v_case jsonb;
  v_got numeric;
  v_expect numeric;
begin
  for v_case in select * from jsonb_array_elements(v_cases)
  loop
    v_expect := (v_case->>2)::numeric;
    v_got := round(game.tier_rate((v_case->>1)::numeric, v_points));
    if v_got is distinct from v_expect then
      raise exception '% : expected % got %', v_case->>0, v_expect, v_got;
    end if;
  end loop;
  raise notice 'OK: game.tier_rate / game.pricing_curve match the TS fixture';
end $$;

do $$
declare
  v_empty jsonb := jsonb_build_array(jsonb_build_object('duration_minutes', 0, 'rate', 0));
  v_got numeric;
begin
  v_got := game.tier_rate(60, v_empty);
  if v_got is distinct from 0 then
    raise exception 'degenerate zero-tiers case: expected 0 got %', v_got;
  end if;
  raise notice 'OK: zero configured tiers prices at 0';
end $$;

do $$
declare
  v_single jsonb := jsonb_build_array(
    jsonb_build_object('duration_minutes', 0,  'rate', 0),
    jsonb_build_object('duration_minutes', 60, 'rate', 5000)
  );
  v_got numeric;
begin
  -- One configured point + the origin is a 2-point line - the exact
  -- equivalence the whole design leans on: this must equal the OLD
  -- rate_per_hour * minutes / 60 formula for every boundary it used to cover.
  v_got := round(game.tier_rate(47, v_single));
  if v_got is distinct from round(5000.0 * 47 / 60) then
    raise exception 'legacy equivalence at 47 min: expected % got %', round(5000.0 * 47 / 60), v_got;
  end if;
  raise notice 'OK: one tier reduces to the legacy rate_per_hour * minutes / 60 formula';
end $$;

-- ── end-to-end: a live session bills off its OWN frozen snapshot ───────────
-- Requires a real station/staff/pricing row to open a session against. If
-- this project's schema has none matching the ids below, point them at a
-- real station/tier pair before running - this block is deliberately
-- destructive to that one tier's pricing_tiers rows (it overwrites them
-- twice) so it must never be pointed at a production project.

do $$
declare
  v_tier text;
  v_station uuid;
  v_session uuid;
  v_before jsonb;
  v_charged int;
  v_playtime numeric;
begin
  select tier, id into v_tier, v_station from game.stations where status = 'available' limit 1;
  if v_station is null then
    raise notice 'SKIPPED end-to-end block: no available station to test against.';
    return;
  end if;

  -- Known curve, then open.
  perform game.replace_pricing_tiers(v_tier,
    '[{"duration_minutes":30,"rate":2000},{"duration_minutes":60,"rate":4500}]'::jsonb,
    30, 10, 5);
  v_session := game.open_session(v_station);
  select sold_pricing into v_before from game.sessions where id = v_session;

  -- Price changes AFTER open must never move this session's bill.
  perform game.replace_pricing_tiers(v_tier,
    '[{"duration_minutes":30,"rate":2000},{"duration_minutes":60,"rate":99999}]'::jsonb,
    30, 10, 5);

  update game.sessions set started_at = now() - interval '50 minutes' where id = v_session;
  select charged_minutes, playtime_total into v_charged, v_playtime
    from game.close_session(v_session, 'cash');

  if v_charged is distinct from 50 then
    raise exception 'close_session blocking: expected charged_minutes=50 got %', v_charged;
  end if;
  -- Frozen curve (30->2000, 60->4500) at 50 min, NOT the live 99999 one.
  if round(v_playtime) is distinct from 3667 then
    raise exception 'close_session priced off LIVE pricing instead of the frozen snapshot: expected 3667 got %', round(v_playtime);
  end if;

  -- A correction after yet another price change must still reproduce the
  -- original number, never today's.
  perform game.replace_pricing_tiers(v_tier,
    '[{"duration_minutes":30,"rate":1},{"duration_minutes":60,"rate":1}]'::jsonb,
    30, 10, 5);
  select charged_minutes, playtime_total into v_charged, v_playtime
    from game.correct_session(v_session, 62, 'db-test correction');
  if v_charged is distinct from 60 or round(v_playtime) is distinct from 4500 then
    raise exception 'correct_session did not replay the frozen snapshot: expected charged_minutes=60, playtime_total=4500, got charged_minutes=%, playtime_total=%',
      v_charged, round(v_playtime);
  end if;

  raise notice 'OK: a session prices off its own frozen sold_pricing snapshot across two live price changes';
end $$;
