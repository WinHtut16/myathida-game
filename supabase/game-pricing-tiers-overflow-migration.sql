-- Fixes how a duration beyond the highest configured price tier gets
-- priced. Was: a linear guess off the last two configured points' slope.
-- Now: whole blocks of the highest tier's own price, plus whatever the
-- leftover minutes cost the ordinary way.
--
-- WHY THIS EXISTS
-- The client confirmed real PS4 numbers after the per-duration-tier feature
-- shipped: 30min=2000, 60min=3000, 90min=5000, 120min=6000. Check the
-- arithmetic: 5000 = 2000+3000 (30+60), 6000 = 2*3000 (2*60). That is NOT
-- what the shipped formula computes - the shipped game.tier_rate()
-- extrapolates linearly off the 30->60 segment's slope for anything past
-- 60, which would give a different (wrong, to the client) number. In their
-- own words: "70 min counts in the grace/block rounding... it will count
-- price still as 60 min price. 2h26min will price be 2h30min price... the
-- rest of the price calculation will just be combination of 30 mins and
-- 60 mins as long as they are not set manually."
--
-- This ONLY changes pricing ABOVE the highest tier an admin has actually
-- set. Pricing BETWEEN configured points (e.g. between 30 and 60) is
-- untouched - still a straight line, confirmed fine as-is. 90/120 are
-- still never stored as real pricing_tiers rows by this rule - they stay
-- computed on the fly every time, exactly as before; an admin can still
-- add a real 90-minute row via the existing "+ Add duration" UI, which
-- still wins outright over this computed fallback (unchanged: the new
-- logic only ever runs for a minute count PAST every configured point).
--
-- This file only replaces game.tier_rate's body on its EXISTING signature -
-- no new table, no new column, no grant/drop changes, and
-- game.close_session()/game.record_session()/game.correct_session() all
-- call it exactly as before and need no changes themselves.
--
-- IDEMPOTENT. Safe to re-run (create or replace on an unchanged signature).

begin;

do $$
begin
  if to_regprocedure('game.tier_rate(numeric,jsonb)') is null then
    raise exception 'game-pricing-tiers-migration.sql has not been applied. Nothing was changed.';
  end if;
end $$;

-- Was `language sql` with a single CTE pipeline that also handled a
-- "beyond range" case via linear extrapolation off the last segment. Now
-- `language plpgsql` (matching game.bill_minutes()'s own precedent for
-- multi-branch-with-early-return clarity) so the "beyond the top point"
-- case can short-circuit into a recursive call before ever reaching the
-- CTE, whose own "beyond range" branch is now unreachable and removed -
-- every call that still reaches it has already been guarded to
-- p_minutes <= v_top_d.
create or replace function game.tier_rate(p_minutes numeric, p_points jsonb)
returns numeric language plpgsql immutable as $$
declare
  v_count     int;
  v_top_d     numeric;
  v_top_r     numeric;
  v_k         numeric;
  v_remainder numeric;
begin
  select count(*) into v_count from jsonb_array_elements(p_points);

  if v_count = 0 then
    return 0;
  end if;
  if v_count = 1 then
    return (p_points->0->>'rate')::numeric;
  end if;

  -- p_points is always sorted ascending with the origin first (both
  -- game.pricing_curve()'s own output and every sessions.sold_pricing->
  -- 'points' blob are shaped this way), but the top point is found by
  -- VALUE here, not array position - staying consistent with the CTE
  -- below, which already sorts by value (row_number() over (order by d))
  -- rather than trusting input order.
  select (e->>'duration_minutes')::numeric, (e->>'rate')::numeric
    into v_top_d, v_top_r
    from jsonb_array_elements(p_points) e
   order by (e->>'duration_minutes')::numeric desc
   limit 1;

  -- Beyond the highest configured point: whole blocks of ITS price, plus
  -- the leftover minutes priced the ordinary way below. remainder is
  -- always < v_top_d by construction, so this recursive call always lands
  -- in the branch below and never recurses again.
  if p_minutes > v_top_d then
    v_k := floor(p_minutes / v_top_d);
    v_remainder := p_minutes - v_k * v_top_d;
    return v_k * v_top_r + game.tier_rate(v_remainder, p_points);
  end if;

  -- p_minutes <= v_top_d: unchanged bracket-and-interpolate logic.
  return (
    with pts as (
      select (e->>'duration_minutes')::numeric as d, (e->>'rate')::numeric as r
      from jsonb_array_elements(p_points) as e
    ),
    ranked as (
      select d, r, row_number() over (order by d) as rn from pts
    ),
    segs as (
      select a.d as lo_d, a.r as lo_r, b.d as hi_d, b.r as hi_r, a.rn as seg_no
      from ranked a join ranked b on b.rn = a.rn + 1
    ),
    chosen as (
      select *,
        case
          when p_minutes between lo_d and hi_d then 0        -- exact bracket
          when p_minutes < lo_d and seg_no = 1 then 1          -- below range
          else null
        end as priority
      from segs
    )
    select lo_r + (hi_r - lo_r) / (hi_d - lo_d) * (p_minutes - lo_d)
      from chosen where priority is not null order by priority limit 1
  );
end $$;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   -- client's own PS4 shape: only 30/60 configured, nothing beyond 60.
--   select game.tier_rate(90,
--     '[{"duration_minutes":0,"rate":0},{"duration_minutes":30,"rate":2000},{"duration_minutes":60,"rate":3000}]'::jsonb
--   ); -- expect 5000 (1x60 + 30 remainder: 3000+2000)
--   select game.tier_rate(120,
--     '[{"duration_minutes":0,"rate":0},{"duration_minutes":30,"rate":2000},{"duration_minutes":60,"rate":3000}]'::jsonb
--   ); -- expect 6000 (2x60, no remainder)
--   -- a curve WITH a 90-minute tier explicitly set: top becomes 90, not 60.
--   select game.tier_rate(120,
--     '[{"duration_minutes":0,"rate":0},{"duration_minutes":30,"rate":2500},{"duration_minutes":60,"rate":5000},{"duration_minutes":90,"rate":6500}]'::jsonb
--   ); -- expect 9000 (1x90 + 30 remainder: 6500+2500), NOT 8000 (the old slope guess)
--   -- a non-exact remainder still interpolates ordinarily.
--   select round(game.tier_rate(70,
--     '[{"duration_minutes":0,"rate":0},{"duration_minutes":30,"rate":2000},{"duration_minutes":60,"rate":3000}]'::jsonb
--   )); -- expect 3667 (1x60 + interpolated 10-minute remainder)
