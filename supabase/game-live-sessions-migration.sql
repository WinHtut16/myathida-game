-- Live sessions for the game shop: a station you start, not a form you fill in.
--
-- WHAT CHANGES
-- Today `stations.occupied` is a free-standing flag and a session is typed in
-- after the fact by game.record_session(). A station becomes a station that may
-- have one OPEN session: staff start it, add snacks to it while the customer
-- plays, and close it to take payment. This is the billiards model, deliberately
-- - the client has already learned it from the user guide, and one mental model
-- across two businesses is worth more than any local cleverness.
--
-- record_session() STAYS. Staff will forget to hit Start, and without a
-- retroactive path that session's revenue is never recorded at all. Two ways
-- into the table is the lesser evil.
--
-- BILLING IS BILLIARDS' FORMULA, TO THE LETTER
--   billed = max(min_minutes, ceil((elapsed - grace) / increment) * increment)
-- Blocks rather than per-minute is not only for consistency: with a count-up
-- timer, per-minute billing punishes staff for being slow to tap Close - a bill
-- that moves every minute means closing out 40 seconds late overcharges the
-- customer. Blocks make a slow tap free. increment/grace default to 10 and 5,
-- which is what billiards is actually running, so the two really do behave the
-- same. They are PER TIER here, which is better than billiards' single global
-- setting: a VIP room can bill in different blocks from a PS4.
--
-- ONE RULE, BOTH DOORS. record_session used to bill per-minute floored at the
-- minimum, so the same hour cost a different amount depending on which screen
-- it was entered from - 62 minutes was 62 min typed in and 60 min on a timer,
-- while 36 minutes was 36 typed in and 40 on a timer. Not even consistently
-- cheaper: it flipped with where in the block you landed, so nobody could quote
-- a price in advance and the owner could not reconcile a day's takings against
-- a rule. The rule IS the price list, so both doors now go through
-- game.bill_minutes() below - one function, called from both, which is why they
-- cannot drift apart again. A typed-in duration is treated as a measurement of
-- how long the station was occupied, which is what it is.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regclass('game.stock_movements') is null then
    raise exception 'game-corrections-migration.sql has not been applied. Nothing was created.';
  end if;
  if to_regprocedure('public.audit(text,text,text,text,text,text,jsonb,uuid)') is null then
    raise exception 'audit-money-migration.sql has not been applied. Nothing was created.';
  end if;
end $$;

-- ── 1. Pricing gains blocks and grace, per tier ─────────────────────────────
alter table game.pricing
  add column if not exists increment_minutes int not null default 10
    check (increment_minutes > 0),
  add column if not exists grace_minutes int not null default 5
    check (grace_minutes >= 0);

-- ── 2. The billing rule, in exactly one place ─────────────────────────────
-- Both close_session (a measured elapsed time) and record_session (a duration
-- typed in afterwards) charge through this. It exists so that they cannot be
-- changed independently: there is no second copy of the arithmetic to forget.
--
--   billed = max(min_minutes, ceil(max(0, elapsed - grace) / increment) * increment)
--   after  = max(min_minutes, billed - min(max(waive_blocks, 0), 1) * increment)
--
-- Call it twice to get both numbers - once with 0 blocks for what the session
-- was worth, once with the request for what is actually charged. The difference
-- is what was waived, which is the number the audit log records, and it is not
-- always what was asked for: a waiver is never allowed through the tier floor.
--
-- immutable because it reads nothing. plpgsql rather than sql so that a zero
-- increment raises instead of dividing by zero and returning null into a
-- not-null money column, where it would surface far from its cause.
create or replace function game.bill_minutes(
  p_elapsed           numeric,
  p_min_minutes       int,
  p_increment_minutes int,
  p_grace_minutes     int,
  p_waive_blocks      int default 0
)
returns int language plpgsql immutable as $$
declare
  v_billed int;
  v_waive  int;
begin
  if p_increment_minutes is null or p_increment_minutes <= 0 then
    raise exception 'Billing increment must be positive (got %).', p_increment_minutes
      using errcode = '22023';
  end if;
  if p_min_minutes is null or p_min_minutes < 0 then
    raise exception 'Minimum charged minutes must not be negative (got %).', p_min_minutes
      using errcode = '22023';
  end if;

  v_billed := greatest(
    p_min_minutes,
    (ceil(greatest(0, coalesce(p_elapsed, 0) - coalesce(p_grace_minutes, 0))
          / p_increment_minutes) * p_increment_minutes)::int
  );
  -- At most one block, and never through the floor.
  v_waive := least(greatest(coalesce(p_waive_blocks, 0), 0), 1) * p_increment_minutes;
  return greatest(p_min_minutes, v_billed - v_waive);
end $$;

-- ── 3. Sessions gain a lifecycle ────────────────────────────────────────────
-- `not null default 'closed'` backfills every historical row correctly in one
-- step: everything that already exists is, by definition, finished.
alter table game.sessions
  add column if not exists status text not null default 'closed'
    check (status in ('active','closed')),
  add column if not exists started_at timestamptz,
  add column if not exists ended_at   timestamptz,
  add column if not exists paid_at    timestamptz,
  add column if not exists payment_method text
    check (payment_method in ('cash','kbzpay','wave','other')),
  add column if not exists waived_minutes int not null default 0
    check (waived_minutes >= 0);

-- An open session does not yet know its duration or its total, so these can no
-- longer be NOT NULL. The guarantee is not abandoned, it MOVES: a row that
-- claims to be closed must still be complete. Dropping the constraint outright
-- on a table holding money history would be the actual mistake here.
alter table game.sessions
  alter column minutes         drop not null,
  alter column charged_minutes drop not null,
  alter column playtime_total  drop not null,
  alter column total           drop not null;

alter table game.sessions drop constraint if exists sessions_closed_is_complete;
alter table game.sessions add constraint sessions_closed_is_complete check (
  status = 'active' or (
    minutes         is not null and
    charged_minutes is not null and
    playtime_total  is not null and
    total           is not null
  )
);

-- Two staff on two phones tapping the same TV is a real event, not a hypothetical.
-- This makes a second open session on one station impossible in the DATABASE,
-- which is the only place it can actually be guaranteed. Billiards does the same.
create unique index if not exists sessions_one_active_per_station
  on game.sessions (station_id) where status = 'active';

-- Historical rows have no started_at/ended_at. That is honest - we do not know
-- when they began - and nothing reads them: reports key on created_at.

-- ── 4. Open a session ───────────────────────────────────────────────────────
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

  update stations set occupied = true where id = v_station.id;
  return v_id;

exception when unique_violation then
  raise exception '% already has a session running.', v_station.name using errcode = '23505';
end $$;

-- ── 5. Add and remove snacks while the customer plays ───────────────────────
-- Stock moves NOW, not at checkout: the crisps have physically left the shelf.
create or replace function game.add_session_item(
  p_session_id uuid,
  p_product_id uuid,
  p_qty        int default 1
)
returns uuid language plpgsql security definer
set search_path = game, public as $$
declare
  s      sessions%rowtype;
  p      products%rowtype;
  v_id   uuid;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;
  if p_qty is null or p_qty <= 0 then
    raise exception 'Quantity must be at least one.' using errcode = '22023';
  end if;

  select * into s from sessions where id = p_session_id and status = 'active' for update;
  if not found then
    raise exception 'That session is not open.' using errcode = '23503';
  end if;

  select * into p from products where id = p_product_id for update;
  if not found then
    raise exception 'Unknown product.' using errcode = '23503';
  end if;
  if not p.active then
    raise exception '% is no longer on sale.', p.name_en using errcode = '23514';
  end if;
  if p.stock is not null and p.stock < p_qty then
    raise exception 'Not enough % in stock (% left, % requested).',
      p.name_en, p.stock, p_qty using errcode = '23514';
  end if;

  insert into order_lines
    (session_id, product_id, product_name, qty, unit_price, line_total)
  values
    (s.id, p.id, p.name_en, p_qty, p.price, p.price * p_qty)
  returning id into v_id;

  if p.stock is not null then
    update products set stock = stock - p_qty where id = p.id;
    insert into stock_movements (product_id, change, reason, session_id, created_by)
      values (p.id, -p_qty, 'sale', s.id, auth.uid());
  end if;

  return v_id;
end $$;

create or replace function game.remove_session_item(p_order_line_id uuid)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  ol order_lines%rowtype;
  s  sessions%rowtype;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;

  select * into ol from order_lines where id = p_order_line_id for update;
  if not found then
    raise exception 'That item is not on the order.' using errcode = '23503';
  end if;

  select * into s from sessions where id = ol.session_id for update;
  -- A closed session is history. Removing a line from one would silently change
  -- a total someone has already been charged; that is a correction, and
  -- void_session is where corrections live.
  if s.status <> 'active' then
    raise exception 'That session is closed. Correct it instead of editing it.'
      using errcode = '23514';
  end if;

  if ol.product_id is not null then
    update products set stock = stock + ol.qty
     where id = ol.product_id and stock is not null;
    insert into stock_movements (product_id, change, reason, session_id, created_by, note)
      values (ol.product_id, ol.qty, 'void_return', s.id, auth.uid(), 'removed from an open order');
  end if;

  delete from order_lines where id = ol.id;
end $$;

-- ── 6. Close and take payment ───────────────────────────────────────────────
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

  update stations set occupied = false where id = s.station_id;
  return s;
end $$;

-- ── 7. Cancel an open session ───────────────────────────────────────────────
-- Not the same operation as void_session, which corrects a CLOSED one. Nothing
-- was sold here, so the row goes and the stock comes back.
--
-- Note the skim vector: open a session, take cash, cancel it, pocket the money.
-- The audit row is the control, which is why it is written BEFORE the delete,
-- while there is still a row to describe. stock_movements survives the delete
-- (session_id is ON DELETE SET NULL), so the shelf trail is never lost either.
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
  update stations set occupied = false where id = s.station_id;
end $$;

-- ── 8. occupied stops being independent truth ───────────────────────────────
-- The session owns that flag now. The manual toggle stays - staff may want to
-- mark a TV busy without billing anyone - but it can no longer contradict a
-- live session, which is the one way this design could quietly rot.
create or replace function game.set_occupied(p_station_id uuid, p_occupied boolean)
returns void language plpgsql security definer
set search_path = game, public as $$
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if exists (select 1 from sessions where station_id = p_station_id and status = 'active') then
    raise exception 'That station has a session running. Close or cancel it instead.'
      using errcode = '23514';
  end if;
  update stations set occupied = p_occupied where id = p_station_id;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;
end $$;

-- ── 9. void_session must not swallow an open session ────────────────────────
-- It selects on `void_reason is null`, which an open session also satisfies, so
-- it would happily "correct" a live session into a half-state with the station
-- still showing occupied. Reproducing that whole function to add one guard
-- invites a transcription error on a money path; a BEFORE trigger is additive,
-- and it also covers any future path that tries the same thing.
create or replace function game.reject_void_of_open_session()
returns trigger language plpgsql
set search_path = game, public as $$
begin
  if new.void_reason is not null and old.void_reason is null and old.status = 'active' then
    raise exception 'That session is still open. Cancel it instead of correcting it.'
      using errcode = '23514';
  end if;
  return new;
end $$;

drop trigger if exists reject_void_of_open_session on game.sessions;
create trigger reject_void_of_open_session
  before update of void_reason on game.sessions
  for each row execute function game.reject_void_of_open_session();

-- ── 10. The audit row now knows about payment and waivers ────────────────────
-- Same trigger point as before (`update of total`, which both close_session and
-- record_session reach exactly once), extended with the two new facts. The
-- summary distinguishes the two paths by whether a timer ran, because "closed a
-- session that ran for 50 minutes" and "typed in a session afterwards" are
-- different events to anyone reading this log.
create or replace function public.audit_game_session_recorded()
returns trigger language plpgsql security definer
set search_path = game, public as $$
begin
  begin
    perform public.audit(
      'game',
      case when new.started_at is null then 'session.recorded' else 'session.closed' end,
      format('%s %s min on %s for %s.%s%s',
             case when new.started_at is null then 'Recorded' else 'Closed' end,
             new.charged_minutes,
             coalesce(new.station_name, 'a station'),
             coalesce(new.total, 0),
             case when coalesce(new.snacks_total, 0) > 0
                  then format(' Includes %s of snacks.', new.snacks_total) else '' end,
             case when coalesce(new.waived_minutes, 0) > 0
                  then format(' Waived %s min.', new.waived_minutes) else '' end),
      'session', new.id::text, new.station_name,
      jsonb_build_object(
        'station',         new.station_name,
        'tier',            new.tier,
        'minutes',         new.minutes,
        'charged_minutes', new.charged_minutes,
        'waived_minutes',  coalesce(new.waived_minutes, 0),
        'playtime_total',  new.playtime_total,
        'snacks_total',    new.snacks_total,
        'total',           new.total,
        'payment_method',  new.payment_method,
        'label',           new.label
      ),
      new.created_by
    );
  exception when others then
    -- The till must not stop because the log did. See audit-operations-migration.sql.
    raise warning 'audit_game_session_recorded failed for session %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

-- ── 11. record_session comes onto the same rule ───────────────────────────
-- Reproduced in full because create-or-replace has no way to patch a body. It
-- is a MECHANICAL copy of the version in game-corrections-migration.sql with
-- three deliberate edits, each marked below - a money function is no place to
-- retype a hundred lines from memory.
--
-- Why it survives at all: staff forget to hit Start. Without this door the
-- session's revenue is never recorded. What changes is only the price it
-- charges, which is now game.bill_minutes() - the same call close_session
-- makes, with the same tier's increment and grace.
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

  select * into v_station from game.stations where id = p_station_id for update;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;

  select * into v_pricing from game.pricing where tier = v_station.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', v_station.tier
      using errcode = '23503';
  end if;

  -- New since the lifecycle exists: typing a session in while one is RUNNING on
  -- the same station would record a second, closed session AND clear occupied,
  -- orphaning the live one. The `for update` above is what makes this hold
  -- against open_session racing it.
  if exists (
    select 1 from game.sessions
     where station_id = v_station.id and status = 'active'
  ) then
    raise exception '% has a session running. Close that one instead of recording another.',
      v_station.name using errcode = '23514';
  end if;

  -- THE ONE CHANGE THAT MATTERS. Was `greatest(p_minutes, min_minutes)`, which
  -- priced a typed-in hour differently from a timed one. `minutes` still keeps
  -- the duration exactly as it was entered; only the CHARGE goes through the
  -- shared rule. No waiver on this path - there is no block to forgive when
  -- nobody was watching a clock.
  v_charged  := game.bill_minutes(p_minutes, v_pricing.min_minutes,
                                  v_pricing.increment_minutes,
                                  v_pricing.grace_minutes, 0);
  -- Multiply before dividing, as close_session does. Division first can lose a
  -- kyat at a rounding boundary, and two paths to the same total must not
  -- disagree by even that much.
  v_playtime := round(v_pricing.rate_per_hour * v_charged / 60.0);

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

  update game.stations set occupied = false where id = v_station.id;

  return v_session;
end $$;

-- ── 12. Grants, following the project's hardening pattern ───────────────────
revoke all on function game.open_session(uuid, text)                  from public, anon;
revoke all on function game.add_session_item(uuid, uuid, int)         from public, anon;
revoke all on function game.remove_session_item(uuid)                 from public, anon;
revoke all on function game.close_session(uuid, text, int)            from public, anon;
revoke all on function game.cancel_active_session(uuid, text)         from public, anon;
revoke all on function game.bill_minutes(numeric, int, int, int, int) from public, anon;
-- record_session predates this file; `from public` was already revoked in
-- game-schema-migration.sql and anon is added here because an anonymous
-- visitor must never be able to book revenue. Narrowing only.
revoke all on function game.record_session(uuid, int, jsonb, text)   from public, anon;

grant execute on function game.open_session(uuid, text)               to authenticated, service_role;
grant execute on function game.add_session_item(uuid, uuid, int)      to authenticated, service_role;
grant execute on function game.remove_session_item(uuid)              to authenticated, service_role;
grant execute on function game.close_session(uuid, text, int)         to authenticated, service_role;
grant execute on function game.cancel_active_session(uuid, text)      to authenticated, service_role;
grant execute on function game.bill_minutes(numeric, int, int, int, int) to authenticated, service_role;
-- create-or-replace keeps the privileges record_session already had; restated
-- so this file describes the end state on its own. Deliberately NOT widened to
-- service_role like the new functions above - replacing a body is no reason to
-- change who may call a money function that has been live.
grant execute on function game.record_session(uuid, int, jsonb, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   select tier, rate_per_hour, min_minutes, increment_minutes, grace_minutes from game.pricing;
--   select indexname from pg_indexes where tablename='sessions' and schemaname='game';
--   select status, count(*) from game.sessions group by status;
--   -- both doors must agree; 30/30/40/60/70 for a 30-min-min, 10-block, 5-grace tier
--   select m, game.bill_minutes(m, 30, 10, 5, 0) from unnest(array[2,30,36,62,66]) m;
