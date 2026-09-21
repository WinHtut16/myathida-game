-- Widen two superadmin-only writes to any active staff (admin or superadmin).
--
-- WHY THIS EXISTS
-- The owner wants a plain admin able to (1) correct the amount on a past
-- session and (2) enable/disable and restock snacks, without also handing
-- them price changes, product add/delete, or the ability to void/cancel a
-- session outright. This repo only has two ranks - game.is_active_staff()
-- already means "signed in, granted on this app, not soft-deleted", i.e.
-- exactly "either role" - so opening a write to admin is just swapping its
-- guard from game.is_superadmin() to game.is_active_staff(). Nothing else
-- about these functions changes: a correction still requires a reason and
-- still stamps corrected_by, so who did it stays traceable.
--
-- Left untouched, still superadmin-only: game.void_session, game.delete_product,
-- the products_write_superadmin RLS policy (name/price edits, insert, delete),
-- and the pricing write policy.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('game.correct_session(uuid,int,text)') is null then
    raise exception 'game-correct-session-migration.sql has not been applied. Nothing was changed.';
  end if;
  if to_regprocedure('game.set_stock(uuid,integer,text)') is null then
    raise exception 'game-stock-firstcount-migration.sql has not been applied. Nothing was changed.';
  end if;
end $$;

-- ── 1. Session correction: superadmin -> any active staff ──────────────────
-- Byte-for-byte the version in game-correct-session-migration.sql, except the
-- guard on the line below.
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
  pr         pricing%rowtype;
  v_charged  int;
  v_playtime numeric;
  v_now      timestamptz := now();
begin
  -- Any active staff. A correction still requires a reason and is logged with
  -- corrected_by, so it stays traceable even though it is no longer
  -- superadmin-only. Voiding a session outright is a separate, still
  -- superadmin-only function - this only fixes a wrong duration/amount.
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

  select * into pr from pricing where tier = s.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', s.tier using errcode = '23503';
  end if;

  -- Same rule as the timer and the typed-in path: one duration, one price.
  -- rate_per_hour comes off the SESSION, not the tier - a price change since
  -- the customer paid must not move a bill they already agreed to. Blocks and
  -- grace come from the tier, because those describe how the shop rounds, not
  -- what it charges.
  v_charged  := game.bill_minutes(p_minutes, pr.min_minutes,
                                  pr.increment_minutes, pr.grace_minutes, 0);
  v_playtime := round(s.rate_per_hour * v_charged / 60.0);

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

-- ── 2. Stock changes: superadmin -> any active staff ────────────────────────
-- Byte-for-byte the version in game-stock-firstcount-migration.sql, except the
-- guard on the line below.
create or replace function game.set_stock(
  p_product_id uuid,
  p_stock      integer,
  p_note       text default null
)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  v_old integer;
  v_delta integer;
begin
  if not game.is_active_staff() then
    raise exception 'Only active staff can change stock.' using errcode = '42501';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'Stock cannot be negative.' using errcode = '22023';
  end if;

  select stock into v_old from game.products where id = p_product_id for update;
  if not found then
    raise exception 'Unknown product.' using errcode = '23503';
  end if;

  update game.products set stock = p_stock where id = p_product_id;

  if p_stock is not null then
    if v_old is null then
      -- First count for a previously untracked item: log the whole amount so
      -- the ledger is not silently missing the opening balance.
      if p_stock <> 0 then
        insert into game.stock_movements (product_id, change, reason, created_by, note)
        values (p_product_id, p_stock, 'restock', auth.uid(), p_note);
      end if;
    else
      v_delta := p_stock - v_old;
      if v_delta <> 0 then
        insert into game.stock_movements (product_id, change, reason, created_by, note)
        values (p_product_id, v_delta,
                case when v_delta > 0 then 'restock' else 'adjustment' end,
                auth.uid(), p_note);
      end if;
    end if;
  end if;
  -- number -> null ("stop tracking") has no numeric delta and records nothing.
end $$;

revoke all on function game.set_stock(uuid, integer, text) from public;
grant execute on function game.set_stock(uuid, integer, text) to authenticated;

-- ── 3. Enable/disable a snack: new narrow RPC for any active staff ─────────
-- setProductActiveAction used to be a plain `update products set active = ...`,
-- gated by the products_write_superadmin RLS policy - the same policy that
-- guards name/price edits and inserts. RLS cannot restrict by column, so
-- rather than loosen that whole policy (which would also open price edits to
-- admin), this is its own security-definer function that only ever touches
-- the `active` column.
create or replace function game.set_product_active(
  p_product_id uuid,
  p_active     boolean
)
returns void language plpgsql security definer
set search_path = game, public as $$
begin
  if not game.is_active_staff() then
    raise exception 'Only active staff can change product availability.' using errcode = '42501';
  end if;

  update products set active = p_active where id = p_product_id;
  if not found then
    raise exception 'Unknown product.' using errcode = '23503';
  end if;
end $$;

revoke all on function game.set_product_active(uuid, boolean) from public;
grant execute on function game.set_product_active(uuid, boolean) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   -- as a plain admin: should now succeed
--   select game.correct_session('<closed session id>', 30, 'test correction');
--   select game.set_stock('<product id>', 5, 'test restock');
--   select game.set_product_active('<product id>', false);
--   -- as a plain admin: should still fail with 42501
--   update game.products set price = 999 where id = '<product id>';
--   select game.void_session('<session id>', 'test void', false);
