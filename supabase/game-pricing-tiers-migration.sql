-- Per-duration pricing: 30/60/90+ minutes each independently priced, instead
-- of one rate_per_hour that every duration (including 30 minutes) was always
-- a linear multiple of.
--
-- WHY THIS EXISTS
-- The client wants to set a 30-minute price that is not simply half the
-- 60-minute price - and later, possibly, independent 90/120-minute prices
-- too. There was no 30-minute price to begin with: every duration already
-- went through the same `rate_per_hour * minutes / 60` formula, so 30
-- minutes only ever LOOKED derived.
--
-- THE MODEL
-- `pricing_tiers` holds admin-set (duration_minutes, rate) points, as many
-- as the owner wants, independent of each other - 90 is never 60 + 30. Any
-- duration that does not land exactly on a point (any live-session or
-- typed-in minute count) is priced by piecewise-LINEAR interpolation through
-- the configured points PLUS an implicit (0,0) origin, extrapolated beyond
-- the highest point using the slope of the nearest segment. This is a strict
-- generalisation of today's formula: one point at (60, rate_per_hour) plus
-- the origin is a straight line through two points, which is exactly
-- `rate_per_hour * minutes / 60`. Nothing changes for a tier until a second
-- duration is actually configured for it.
--
-- pricing.rate_per_hour is KEPT, not dropped - every display-only reader
-- (the floor tile, the live session tile, the record-session hint, the
-- Reports receipt label) only ever prints it, never uses it to bill. Rather
-- than rewrite every one of those, it becomes a MIRROR of the 60-minute
-- point, kept in sync by a trigger on pricing_tiers so it can never drift
-- from what admins actually set.
--
-- SESSIONS GAIN sold_pricing: a session already snapshots rate_per_hour so a
-- later price change cannot move a bill already charged. One number is not
-- enough for a whole curve, so sold_pricing freezes the FULL curve (plus the
-- blocking rule) at the moment the rate was decided. game.correct_session()
-- now replays against that snapshot alone and never reads live pricing again.
--
-- ALSO FIXED HERE: game.record_session() has, since before this migration,
-- billed a typed-in duration as a flat `greatest(minutes, min_minutes)` -
-- no block/grace rounding at all - while game.close_session() (the live
-- timer) rounds to a block via game.bill_minutes(), and the TS preview shown
-- to staff before they save (src/lib/pricing.ts: computePlaytime) already
-- assumes BOTH doors round identically. That mismatch between the preview
-- and the actual charge is a pre-existing bug, not something this migration
-- introduces - but record_session's body is being replaced anyway to wire in
-- the new curve, so it is fixed in the same edit rather than left to drift
-- further from a formula this migration already has to touch.
--
-- IDEMPOTENT. Safe to re-run - the table/trigger/function creates are all
-- `if not exists`/`create or replace`, and the seed inserts are
-- `on conflict do nothing`.

begin;

do $$
begin
  if to_regprocedure('game.correct_session(uuid,int,text)') is null then
    raise exception 'game-admin-permissions-migration.sql has not been applied. Nothing was created.';
  end if;
  if to_regprocedure('game.bill_minutes(numeric,int,int,int,int)') is null then
    raise exception 'game-live-sessions-migration.sql has not been applied. Nothing was created.';
  end if;
end $$;

-- ── 1. Admin-set (duration, price) points, independent per tier ────────────
create table if not exists game.pricing_tiers (
  id               uuid primary key default gen_random_uuid(),
  tier             text not null references game.pricing (tier) on delete cascade,
  duration_minutes int not null check (duration_minutes > 0),
  -- The TOTAL price for exactly duration_minutes of play, not an hourly
  -- rate - so that one point at (60, 5000) means exactly what rate_per_hour
  -- used to mean.
  rate             numeric not null check (rate >= 0),
  created_at       timestamptz not null default now(),
  unique (tier, duration_minutes)
);

comment on table game.pricing_tiers is
  'Admin-set (duration, price) points per station tier, independently
   priced - 90 is never derived from 60+30. game.pricing_curve() and
   game.tier_rate() interpolate/extrapolate piecewise-linearly through these
   points plus an implicit (0,0) origin, so ANY minute count - not only one
   matching a configured point - prices correctly. The 60-minute point is
   mandatory per tier (enforced in game.replace_pricing_tiers below, and
   client-side in updatePricingAction) because game.pricing.rate_per_hour
   mirrors it for every legacy display-only reader.';

alter table game.pricing_tiers enable row level security;

drop policy if exists pricing_tiers_select on game.pricing_tiers;
create policy pricing_tiers_select on game.pricing_tiers for select
  using (game.is_active_staff());

drop policy if exists pricing_tiers_write_superadmin on game.pricing_tiers;
create policy pricing_tiers_write_superadmin on game.pricing_tiers for all
  using (game.is_superadmin()) with check (game.is_superadmin());

-- ── 2. Seed: a 60-minute point from today's rate, plus a 30-minute ─────────
--      STARTING VALUE - a one-time migration convenience, never an ongoing
--      derivation. Nothing in game.replace_pricing_tiers or this migration
--      ever recomputes 30 from 60 again after this statement runs; the owner
--      should review and likely change it.
insert into game.pricing_tiers (tier, duration_minutes, rate)
select tier, 60, rate_per_hour from game.pricing
on conflict (tier, duration_minutes) do nothing;

insert into game.pricing_tiers (tier, duration_minutes, rate)
select tier, 30, round(rate_per_hour / 2) from game.pricing
on conflict (tier, duration_minutes) do nothing;

-- ── 3. pricing.rate_per_hour becomes a maintained mirror ────────────────────
-- Every display-only reader (floor tile, live session tile, record-session
-- hint, Reports receipt label) only ever prints this column; none of them
-- bill with it after this migration. Rather than rewrite all of them to join
-- pricing_tiers themselves, the column stays and a trigger keeps it equal to
-- the tier's own 60-minute point - so it can never silently drift from what
-- was actually set, the same guarantee this codebase already insists on for
-- every other write (see catalogue.ts's "an UPDATE that RLS filters out must
-- not look like success" rule - this is that same instinct applied to a
-- derived column instead of a filtered write).
comment on column game.pricing.rate_per_hour is
  'Mirrored from pricing_tiers'' 60-minute row by the sync_pricing_rate_per_hour
   trigger below - no longer authoritative. Write pricing_tiers (via
   game.replace_pricing_tiers), not this column directly.';

create or replace function game.sync_pricing_rate_per_hour()
returns trigger language plpgsql security definer
set search_path = game, public as $$
begin
  update game.pricing
     set rate_per_hour = coalesce(
       (select rate from game.pricing_tiers
         where tier = coalesce(new.tier, old.tier) and duration_minutes = 60),
       0)
   where tier = coalesce(new.tier, old.tier);
  return null;
end $$;

drop trigger if exists sync_pricing_rate_per_hour on game.pricing_tiers;
create trigger sync_pricing_rate_per_hour
  after insert or update or delete on game.pricing_tiers
  for each row execute function game.sync_pricing_rate_per_hour();

-- ── 4. The curve, and the lookup over it ────────────────────────────────────
-- The live curve for a tier, origin always explicit so tier_rate() never has
-- to special-case it. This is also the exact shape snapshotted onto
-- sessions.sold_pricing.points below.
create or replace function game.pricing_curve(p_tier text)
returns jsonb language sql stable
set search_path = game, public as $$
  select jsonb_agg(jsonb_build_object('duration_minutes', d, 'rate', r) order by d)
  from (
    select 0::int as d, 0::numeric as r
    union all
    select duration_minutes, rate from game.pricing_tiers where tier = p_tier
  ) pts;
$$;

-- Piecewise-linear lookup over a jsonb array of {duration_minutes, rate},
-- ALREADY sorted ascending and ALREADY containing the (0,0) origin - true
-- both for game.pricing_curve()'s own output and for every sessions.sold_
-- pricing->'points' blob, so this never has to special-case where the curve
-- starts. Mirrors src/lib/pricing.ts's tierRate() exactly - same bracketing,
-- same nearest-segment extrapolation beyond either end.
create or replace function game.tier_rate(p_minutes numeric, p_points jsonb)
returns numeric language sql immutable as $$
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
        when p_minutes between lo_d and hi_d then 0              -- exact bracket
        when p_minutes < lo_d and seg_no = 1 then 1               -- below range
        when p_minutes > hi_d and hi_d = (select max(d) from ranked) then 2 -- beyond range
        else null
      end as priority
    from segs
  )
  select coalesce(
    (select lo_r + (hi_r - lo_r) / (hi_d - lo_d) * (p_minutes - lo_d)
       from chosen where priority is not null order by priority limit 1),
    (select r from ranked order by rn limit 1)   -- degenerate: exactly one point
  );
$$;

-- ── 5. Sessions snapshot the full curve, not just one number ────────────────
alter table game.sessions
  add column if not exists sold_pricing jsonb;

comment on column game.sessions.sold_pricing is
  'The full pricing structure in effect when this session''s RATE was decided
   - not when it was closed. Generalises rate_per_hour''s existing freeze:
   game.open_session()/game.record_session() write "points" at the same
   moment they write rate_per_hour, and game.close_session() never touches
   it, exactly as it never touches rate_per_hour. min_minutes/increment_
   minutes/grace_minutes are OVERWRITTEN by whichever function actually
   bills the session (close_session or record_session) with the live values
   it just used - recording after the fact what already happened, so this
   column always holds exactly the numbers that produced this row''s
   playtime_total. game.correct_session() replays entirely against this,
   never against today''s game.pricing/pricing_tiers, so a later price or
   block-size change cannot move a bill already charged. Shape:
     {"points": [{"duration_minutes":0,"rate":0}, {"duration_minutes":60,"rate":3000}, ...],
      "min_minutes": 30, "increment_minutes": 10, "grace_minutes": 5}
   Null only on a row written before this column existed and not yet
   backfilled by step 6 below.';

-- ── 6. Backfill every existing row ──────────────────────────────────────────
-- Every existing row only ever had one number (rate_per_hour) and read
-- min/increment/grace LIVE from game.pricing at correction time - which, at
-- the moment this migration runs, equals TODAY's values. Synthesizing the
-- 2-point curve from each row's own snapshotted rate, paired with today's
-- live blocking rule, reproduces exactly what a correction would compute
-- right now - which is the stated goal. One behaviour tightening worth
-- knowing: a correction on an old row used to implicitly float with a LATER
-- increment/grace edit (it read live); after this backfill it freezes to
-- whatever was live at migration time, matching the stricter contract
-- rate_per_hour already had. Deliberate, not silent - called out here.
update game.sessions s
   set sold_pricing = jsonb_build_object(
     'points', jsonb_build_array(
       jsonb_build_object('duration_minutes', 0,  'rate', 0),
       jsonb_build_object('duration_minutes', 60, 'rate', s.rate_per_hour)
     ),
     'min_minutes',       pr.min_minutes,
     'increment_minutes', pr.increment_minutes,
     'grace_minutes',     pr.grace_minutes
   )
  from game.pricing pr
 where pr.tier = s.tier
   and s.sold_pricing is null;

-- ── 7. Replacing a tier's whole price list, in one call ─────────────────────
-- A deliberate exception to catalogue.ts's own "plain writes, no RPC" rule -
-- that rule holds for a single scalar field (there is no money to derive,
-- the value typed IS the value stored); replacing a VARIABLE-LENGTH list of
-- rows is a delete-then-insert, which two separate .from(...) calls from a
-- server action could not do atomically.
create or replace function game.replace_pricing_tiers(
  p_tier              text,
  p_points            jsonb,  -- [{"duration_minutes": int, "rate": numeric}, ...]
  p_min_minutes       int,
  p_increment_minutes int,
  p_grace_minutes     int
)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  v_count int;
begin
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can change the catalogue.' using errcode = '42501';
  end if;
  if p_points is null or jsonb_array_length(p_points) = 0 then
    raise exception 'Pricing needs at least one duration tier.' using errcode = '23514';
  end if;
  if not exists (
    select 1 from jsonb_array_elements(p_points) e where (e->>'duration_minutes')::int = 60
  ) then
    raise exception 'Pricing needs a 60-minute rate — everything else is based on it.'
      using errcode = '23514';
  end if;

  delete from game.pricing_tiers where tier = p_tier;

  insert into game.pricing_tiers (tier, duration_minutes, rate)
  select p_tier, (e->>'duration_minutes')::int, (e->>'rate')::numeric
  from jsonb_array_elements(p_points) e;

  update game.pricing set
    min_minutes       = p_min_minutes,
    increment_minutes = p_increment_minutes,
    grace_minutes      = p_grace_minutes
  where tier = p_tier;

  get diagnostics v_count = row_count;
  if v_count = 0 then
    raise exception 'Unknown tier %.', p_tier using errcode = '23503';
  end if;
end $$;

revoke all on function game.replace_pricing_tiers(text, jsonb, int, int, int) from public, anon;
grant execute on function game.replace_pricing_tiers(text, jsonb, int, int, int) to authenticated;

-- ── 8. open_session: also snapshot the curve ────────────────────────────────
-- Byte-for-byte the version in game-station-state-migration.sql, except the
-- sold_pricing write marked below. rate_per_hour's own snapshot is untouched.
create or replace function game.open_session(
  p_station_id uuid,
  p_label      text default null
)
returns uuid language plpgsql security definer
set search_path = game, public as $$
declare
  v_station stations%rowtype;
  v_pricing pricing%rowtype;
  v_id      uuid;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;

  -- for update serialises two staff racing on the same station; the unique
  -- index below is the backstop if they somehow get past it.
  select * into v_station from stations where id = p_station_id for update;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;
  if v_station.status <> 'available' then
    raise exception '% is under maintenance.', v_station.name using errcode = '23514';
  end if;

  select * into v_pricing from pricing where tier = v_station.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', v_station.tier using errcode = '23503';
  end if;

  -- rate_per_hour is snapshotted so a mid-session price change cannot alter a
  -- bill the customer was already quoted, exactly as record_session does.
  -- sold_pricing generalises that same freeze to the whole curve. [EDITED]
  insert into sessions
    (station_id, station_name, tier, rate_per_hour, sold_pricing, status, started_at, label, created_by)
  values
    (v_station.id, v_station.name, v_station.tier, v_pricing.rate_per_hour,
     jsonb_build_object(
       'points', game.pricing_curve(v_station.tier),
       'min_minutes', v_pricing.min_minutes,
       'increment_minutes', v_pricing.increment_minutes,
       'grace_minutes', v_pricing.grace_minutes
     ),
     'active', now(), nullif(btrim(coalesce(p_label, '')), ''), auth.uid())
  returning id into v_id;

  update stations set state = 'occupied' where id = v_station.id;
  return v_id;

exception when unique_violation then
  raise exception '% already has a session running.', v_station.name using errcode = '23505';
end $$;

-- ── 9. close_session: price off the curve, write back the blocking rule ────
-- Byte-for-byte the version in game-station-state-migration.sql, except the
-- rate lookup and the sold_pricing write, both marked below.
create or replace function game.close_session(
  p_session_id     uuid,
  p_payment_method text,
  p_waive_blocks   int default 0
)
returns game.sessions language plpgsql security definer
set search_path = game, public as $$
declare
  s          sessions%rowtype;
  pr         pricing%rowtype;
  v_elapsed  numeric;
  v_billed   int;
  v_after    int;
  v_playtime numeric;
  v_snacks   numeric;
  v_now      timestamptz := now();
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;
  if p_payment_method not in ('cash','kbzpay','wave','other') then
    raise exception 'Invalid payment method %.', p_payment_method using errcode = '22023';
  end if;

  select * into s from sessions where id = p_session_id and status = 'active' for update;
  if not found then
    raise exception 'That session is not open.' using errcode = '23503';
  end if;

  select * into pr from pricing where tier = s.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', s.tier using errcode = '23503';
  end if;

  v_elapsed := greatest(0, extract(epoch from (v_now - s.started_at)) / 60);

  -- What the session was worth, and what is actually being charged. The same
  -- function record_session uses, so one duration cannot carry two prices.
  v_billed := game.bill_minutes(v_elapsed, pr.min_minutes,
                                pr.increment_minutes, pr.grace_minutes, 0);
  v_after  := game.bill_minutes(v_elapsed, pr.min_minutes,
                                pr.increment_minutes, pr.grace_minutes, p_waive_blocks);

  -- Price off the curve FROZEN at open time (s.sold_pricing->'points'), not
  -- today's live pricing_tiers - a price change mid-session must not move
  -- what the customer was quoted. [EDITED, was: round(s.rate_per_hour * v_after / 60.0)]
  v_playtime := round(game.tier_rate(v_after, s.sold_pricing->'points'));
  select coalesce(sum(line_total), 0) into v_snacks from order_lines where session_id = s.id;

  update sessions set
    status          = 'closed',
    ended_at        = v_now,
    -- minutes carries a `> 0` check, and a session closed within a second of
    -- opening would otherwise round to 0 and fail.
    minutes         = greatest(1, round(v_elapsed)::int),
    charged_minutes = v_after,
    waived_minutes  = v_billed - v_after,
    playtime_total  = v_playtime,
    snacks_total    = v_snacks,
    total           = v_playtime + v_snacks,
    payment_method  = p_payment_method,
    paid_at         = v_now,
    -- Record, after the fact, the blocking rule actually used to bill this
    -- session - points are untouched, exactly as rate_per_hour is never
    -- rewritten here. [NEW]
    sold_pricing    = s.sold_pricing || jsonb_build_object(
                         'min_minutes', pr.min_minutes,
                         'increment_minutes', pr.increment_minutes,
                         'grace_minutes', pr.grace_minutes
                       )
  where id = s.id
  returning * into s;

  update stations set state = 'free' where id = s.station_id;
  return s;
end $$;

-- ── 10. record_session: curve pricing AND block-rounding ────────────────────
-- Repeated in full, same convention as every prior migration touching this
-- function. Two edits, both marked: the charge now goes through
-- game.bill_minutes() instead of a flat `greatest(minutes, min_minutes)`
-- floor (a pre-existing mismatch against close_session and against the TS
-- preview shown to staff - see this file's header comment), and it now
-- prices off the curve and writes sold_pricing.
create or replace function game.record_session(
  p_station_id uuid,
  p_minutes    int,
  p_items      jsonb default '[]'::jsonb,
  p_label      text default null
)
returns uuid
language plpgsql security definer
set search_path = game, public as $$
declare
  v_station   game.stations%rowtype;
  v_pricing   game.pricing%rowtype;
  v_session   uuid;
  v_charged   int;
  v_playtime  numeric;
  v_snacks    numeric := 0;
  v_item      jsonb;
  v_product   game.products%rowtype;
  v_qty       int;
  v_line      numeric;
  v_curve     jsonb;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to record sessions for the game shop.'
      using errcode = '42501';
  end if;

  if p_minutes is null or p_minutes <= 0 then
    raise exception 'Session length must be a positive number of minutes.'
      using errcode = '22023';
  end if;

  select * into v_station from game.stations where id = p_station_id;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;

  select * into v_pricing from game.pricing where tier = v_station.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', v_station.tier
      using errcode = '23503';
  end if;

  -- Block-rounded, the same rule close_session uses - a typed-in duration is
  -- a measurement of how long the station was occupied, not a price in
  -- itself. [EDITED, was: v_charged := greatest(p_minutes, v_pricing.min_minutes)]
  v_charged := game.bill_minutes(p_minutes, v_pricing.min_minutes,
                                 v_pricing.increment_minutes, v_pricing.grace_minutes, 0);
  v_curve    := game.pricing_curve(v_station.tier);
  v_playtime := round(game.tier_rate(v_charged, v_curve));

  insert into game.sessions (
    station_id, station_name, tier, rate_per_hour, sold_pricing,
    minutes, charged_minutes, playtime_total, snacks_total, total,
    label, created_by
  ) values (
    v_station.id, v_station.name, v_station.tier, v_pricing.rate_per_hour,
    jsonb_build_object(
      'points', v_curve,
      'min_minutes', v_pricing.min_minutes,
      'increment_minutes', v_pricing.increment_minutes,
      'grace_minutes', v_pricing.grace_minutes
    ),
    p_minutes, v_charged, v_playtime, 0, v_playtime,
    nullif(btrim(coalesce(p_label, '')), ''), auth.uid()
  ) returning id into v_session;

  for v_item in select * from jsonb_array_elements(coalesce(p_items, '[]'::jsonb))
  loop
    v_qty := coalesce((v_item->>'qty')::int, 0);
    continue when v_qty <= 0;

    select * into v_product
      from game.products
     where id = (v_item->>'productId')::uuid
       for update;
    if not found then
      raise exception 'Unknown product in order.' using errcode = '23503';
    end if;
    if not v_product.active then
      raise exception 'Product % is no longer on sale.', v_product.name_en
        using errcode = '23514';
    end if;
    if v_product.stock is not null and v_product.stock < v_qty then
      raise exception 'Not enough % in stock (% left, % requested).',
        v_product.name_en, v_product.stock, v_qty using errcode = '23514';
    end if;

    v_line   := v_product.price * v_qty;
    v_snacks := v_snacks + v_line;

    insert into game.order_lines
      (session_id, product_id, product_name, qty, unit_price, line_total)
    values
      (v_session, v_product.id, v_product.name_en, v_qty, v_product.price, v_line);

    if v_product.stock is not null then
      update game.products set stock = stock - v_qty where id = v_product.id;
      insert into game.stock_movements (product_id, change, reason, session_id, created_by)
        values (v_product.id, -v_qty, 'sale', v_session, auth.uid());
    end if;
  end loop;

  update game.sessions
     set snacks_total = v_snacks,
         total        = v_playtime + v_snacks
   where id = v_session;

  update game.stations set state = 'free' where id = v_station.id;

  return v_session;
end $$;

-- ── 11. correct_session: replay the session's OWN snapshot, never live ─────
-- Byte-for-byte the version in game-admin-permissions-migration.sql, except
-- that it no longer reads game.pricing at all - marked below.
create or replace function game.correct_session(
  p_session_id uuid,
  p_minutes    int,
  p_reason     text
)
returns game.sessions
language plpgsql security definer
set search_path = game, public as $$
declare
  s          sessions%rowtype;
  v_charged  int;
  v_playtime numeric;
  v_now      timestamptz := now();
begin
  if not game.is_active_staff() then
    raise exception 'Only active staff can correct sessions.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  if p_minutes is null or p_minutes <= 0 then
    raise exception 'Corrected length must be a positive number of minutes.'
      using errcode = '22023';
  end if;

  select * into s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'Unknown session.' using errcode = '23503';
  end if;
  -- A running session has no settled charge to correct; close or cancel it.
  if s.status <> 'closed' then
    raise exception 'That session is still open. Close it before correcting it.'
      using errcode = '23514';
  end if;
  -- Cancelling is terminal. Re-pricing a written-off session would quietly put
  -- revenue back on a row the owner has already decided to zero.
  if s.void_reason is not null then
    raise exception 'That session was cancelled. A cancelled session cannot be corrected.'
      using errcode = '23514';
  end if;
  -- A session from before sold_pricing existed cannot be replayed - this
  -- should never fire post-backfill (step 6 above covers every row), but
  -- fails loud rather than computing against a null curve. [NEW]
  if s.sold_pricing is null then
    raise exception 'This session predates pricing snapshots and cannot be corrected automatically.'
      using errcode = '23514';
  end if;

  -- Replays the session's OWN frozen curve and blocking rule - never
  -- game.pricing/game.pricing_tiers as they are today. A price rise since the
  -- customer paid must not move a bill they already agreed to.
  -- [EDITED, was: select * into pr from pricing where tier = s.tier; ... pr.min_minutes etc; s.rate_per_hour]
  v_charged  := game.bill_minutes(p_minutes,
                  (s.sold_pricing->>'min_minutes')::int,
                  (s.sold_pricing->>'increment_minutes')::int,
                  (s.sold_pricing->>'grace_minutes')::int, 0);
  v_playtime := round(game.tier_rate(v_charged, s.sold_pricing->'points'));

  update sessions set
    original_minutes         = coalesce(s.original_minutes,         s.minutes),
    original_charged_minutes = coalesce(s.original_charged_minutes, s.charged_minutes),
    original_total           = coalesce(s.original_total,           s.total),
    minutes           = p_minutes,
    charged_minutes   = v_charged,
    playtime_total    = v_playtime,
    -- Snacks are untouched. A wrong duration is not a wrong crisp packet; use
    -- void_session if the whole sale was wrong.
    total             = v_playtime + coalesce(s.snacks_total, 0),
    correction_reason = btrim(p_reason),
    corrected_by      = auth.uid(),
    corrected_at      = v_now
  -- created_at is deliberately NOT in this list. That is the entire point: the
  -- money stays on the day it was taken.
  where id = s.id
  returning * into s;

  -- No exception handler here, unlike the checkout trigger. That one swallows
  -- audit faults because a till must not stop. This is back-office work with
  -- nobody waiting, so a correction that cannot be recorded must not happen.
  perform public.audit(
    'game', 'session.corrected',
    format('Corrected %s on %s from %s min (%s) to %s min (%s). Reason: %s',
           coalesce(s.label, 'a session'), coalesce(s.station_name, 'a station'),
           s.original_charged_minutes, s.original_total,
           s.charged_minutes, s.total, btrim(p_reason)),
    'session', s.id::text, s.station_name,
    jsonb_build_object(
      'station',                  s.station_name,
      'tier',                     s.tier,
      'reason',                   btrim(p_reason),
      'original_minutes',         s.original_minutes,
      'original_charged_minutes', s.original_charged_minutes,
      'original_total',           s.original_total,
      'minutes',                  s.minutes,
      'charged_minutes',          s.charged_minutes,
      'total',                    s.total,
      'taken_on',                 s.created_at
    ),
    auth.uid()
  );

  return s;
end $$;

revoke all on function game.correct_session(uuid, int, text) from public, anon;
grant execute on function game.correct_session(uuid, int, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   -- as a superadmin: should succeed, and the 60-minute point is mandatory
--   select game.replace_pricing_tiers('PS5',
--     '[{"duration_minutes":30,"rate":2500},{"duration_minutes":60,"rate":5000}]'::jsonb,
--     30, 10, 5);
--   select game.replace_pricing_tiers('PS5', '[{"duration_minutes":30,"rate":2500}]'::jsonb, 30, 10, 5); -- should fail 23514
--   -- as a plain admin: should fail 42501
--   select game.replace_pricing_tiers('PS5', '[{"duration_minutes":60,"rate":5000}]'::jsonb, 30, 10, 5);
--   -- pricing.rate_per_hour mirrors the 60-minute point
--   select tier, rate_per_hour from game.pricing;
--   select tier, duration_minutes, rate from game.pricing_tiers order by tier, duration_minutes;
--   -- curve lookup matches the TS implementation at a non-tier-aligned minute
--   select game.tier_rate(47, game.pricing_curve('PS5'));
--   -- open a session, change prices, close it, confirm it billed off the FROZEN curve
--   select game.open_session('<station id>');
--   update game.pricing_tiers set rate = rate * 2 where tier = 'PS5' and duration_minutes = 60;
--   select game.close_session('<session id>', 'cash');
--   -- correct an old session after changing prices again - must reproduce the pre-change number
--   select game.correct_session('<closed session id>', 62, 'test correction');
