-- Free/Occupied becomes a three-way state: free / reserved / occupied.
--
-- WHY THIS EXISTS
-- The floor board had three tile controls that read as equal-weight buttons:
-- Start session (bills now), Record session (bills after the fact), and a
-- Free/Occupied toggle that bills nothing at all. Sitting next to the other
-- two, staff could mistake the toggle for a lightweight "start" and leave a
-- TV running unbilled. There was also no way to mark a TV held for a
-- customer arriving later without either billing them early or leaving the
-- tile indistinguishable from an ordinary free one.
--
-- `occupied` (boolean) becomes `state` ('free' | 'reserved' | 'occupied'),
-- default 'free'. The session-driven writes (open/close/cancel/record) only
-- ever move between 'free' and 'occupied' - 'reserved' is set exclusively by
-- staff, from the floor board, same permission as the old manual toggle.
-- Starting a session from 'reserved' works exactly as it does from 'free':
-- game.open_session only ever checked station.status ('available' vs
-- 'maintenance'), never the occupied flag, so it overwrites 'reserved' with
-- 'occupied' the same way it used to overwrite 'free'.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('game.set_occupied(uuid,boolean)') is null
     and to_regprocedure('game.set_station_state(uuid,text)') is null then
    raise exception 'game-live-sessions-migration.sql has not been applied. Nothing was created.';
  end if;
end $$;

-- ── 1. occupied (boolean) -> state (text) ───────────────────────────────────
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'game' and table_name = 'stations' and column_name = 'occupied'
  ) then
    alter table game.stations
      alter column occupied type text using (case when occupied then 'occupied' else 'free' end);
    alter table game.stations rename column occupied to state;
  end if;
end $$;

alter table game.stations alter column state set default 'free';
alter table game.stations drop constraint if exists stations_state_check;
alter table game.stations add constraint stations_state_check
  check (state in ('free', 'reserved', 'occupied'));

comment on column game.stations.state is
  'free / reserved / occupied. Session-driven writes (open/close/cancel/record) only ever set free or occupied; reserved is staff-only, via game.set_station_state.';

-- ── 2. open_session writes 'occupied' instead of true ───────────────────────
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
  insert into sessions
    (station_id, station_name, tier, rate_per_hour, status, started_at, label, created_by)
  values
    (v_station.id, v_station.name, v_station.tier, v_pricing.rate_per_hour,
     'active', now(), nullif(btrim(coalesce(p_label, '')), ''), auth.uid())
  returning id into v_id;

  update stations set state = 'occupied' where id = v_station.id;
  return v_id;

exception when unique_violation then
  raise exception '% already has a session running.', v_station.name using errcode = '23505';
end $$;

-- ── 3. close_session writes 'free' instead of false ─────────────────────────
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

  v_playtime := round(s.rate_per_hour * v_after / 60.0);
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
    paid_at         = v_now
  where id = s.id
  returning * into s;

  update stations set state = 'free' where id = s.station_id;
  return s;
end $$;

-- ── 4. cancel_active_session writes 'free' instead of false ─────────────────
create or replace function game.cancel_active_session(
  p_session_id uuid,
  p_reason     text
)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  s  sessions%rowtype;
  ol record;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;

  select * into s from sessions where id = p_session_id and status = 'active' for update;
  if not found then
    raise exception 'That session is not open.' using errcode = '23503';
  end if;

  for ol in select product_id, qty from order_lines where session_id = s.id
  loop
    if ol.product_id is not null then
      update products set stock = stock + ol.qty
       where id = ol.product_id and stock is not null;
      insert into stock_movements (product_id, change, reason, session_id, created_by, note)
        values (ol.product_id, ol.qty, 'void_return', s.id, auth.uid(), btrim(p_reason));
    end if;
  end loop;

  perform public.audit(
    'game', 'session.cancelled',
    format('Cancelled the open session on %s. Reason: %s', s.station_name, btrim(p_reason)),
    'session', s.id::text, s.station_name,
    jsonb_build_object(
      'station', s.station_name,
      'reason',  btrim(p_reason),
      'started_at', s.started_at,
      'snacks_returned', (select coalesce(sum(qty), 0) from order_lines where session_id = s.id)
    ),
    auth.uid()
  );

  delete from sessions where id = s.id;
  update stations set state = 'free' where id = s.station_id;
end $$;

-- ── 5. record_session writes 'free' instead of false ────────────────────────
-- Repeated in full, same as game-corrections-migration.sql, because
-- create-or-replace has no way to patch a body. Copied verbatim from that
-- file's version (the one currently live) with only the occupied write
-- changed - this migration does not touch record_session's billing logic.
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

  v_charged  := greatest(p_minutes, v_pricing.min_minutes);
  v_playtime := round((v_charged::numeric / 60) * v_pricing.rate_per_hour);

  insert into game.sessions (
    station_id, station_name, tier, rate_per_hour,
    minutes, charged_minutes, playtime_total, snacks_total, total,
    label, created_by
  ) values (
    v_station.id, v_station.name, v_station.tier, v_pricing.rate_per_hour,
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

-- ── 6. set_occupied(uuid, boolean) -> set_station_state(uuid, text) ─────────
-- Same guard as before (refuse to contradict a live session); now also
-- validates the three allowed values instead of accepting any boolean.
create or replace function game.set_station_state(p_station_id uuid, p_state text)
returns void language plpgsql security definer
set search_path = game, public as $$
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  -- 23514, not 22023: the client's action layer maps 22023 to a hardcoded
  -- "enter a session length" message (record_session's error), which would
  -- be wrong here. 23514 passes the raw message through untouched.
  if p_state not in ('free', 'reserved', 'occupied') then
    raise exception 'Invalid station state %.', p_state using errcode = '23514';
  end if;
  if exists (select 1 from sessions where station_id = p_station_id and status = 'active') then
    raise exception 'That station has a session running. Close or cancel it instead.'
      using errcode = '23514';
  end if;
  update stations set state = p_state where id = p_station_id;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;
end $$;

-- The old boolean function is gone, not left dangling - it still referenced
-- a column ('occupied') that no longer exists after step 1.
drop function if exists game.set_occupied(uuid, boolean);

revoke all on function game.set_station_state(uuid, text) from public, anon;
grant execute on function game.set_station_state(uuid, text) to authenticated;

commit;
