-- Let an admin fix the SNACKS on a session that is already closed.
--
-- WHY THIS EXISTS
-- game.correct_session() (game-correct-session-migration.sql) fixes a wrong
-- duration on a closed session, on purpose leaving snacks alone: "a wrong
-- duration is not a wrong crisp packet". But staff forget to ring up a snack
-- mid-session just as often as they forget to stop the timer, and today there
-- is no way back for that - game.remove_session_item() explicitly refuses a
-- closed session ("Correct it instead of editing it"), and nothing lets you
-- ADD a forgotten item to one at all.
--
-- This is that correction, for order_lines instead of minutes. Same shape as
-- correct_session: any active staff (not superadmin-only), a required reason,
-- the prior total kept so the receipt can show both, and a call into the
-- shared public.audit(). It is a NEW function rather than a widened
-- add_session_item/remove_session_item, because those two are deliberately
-- single-change, unreasoned, and active-only - a closed-session repair needs a
-- reason and needs to move several lines at once under one explanation, which
-- is a different contract, not a wider version of the same one.
--
-- Stock moves with it, same as a live add/remove: the shelf count is real
-- inventory, and a forgotten snack really did leave the shelf.
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('game.add_session_item(uuid,uuid,int)') is null then
    raise exception 'game-live-sessions-migration.sql has not been applied. Nothing was created.';
  end if;
  if to_regprocedure('game.correct_session(uuid,int,text)') is null then
    raise exception 'game-correct-session-migration.sql has not been applied. Nothing was created.';
  end if;
  if to_regprocedure('public.audit(text,text,text,text,text,text,jsonb,uuid)') is null then
    raise exception 'audit-money-migration.sql has not been applied. Nothing was created.';
  end if;
end $$;

-- ── 1. Remember what the snacks totalled before an edit ─────────────────────
-- Same "fill once, never overwrite" rule as original_total: a second edit
-- still shows the FIRST-EVER snacks total, not what the previous edit left
-- behind. snack_edit_reason/snack_edited_at describe the latest edit instead,
-- and are overwritten every time - that is what makes them "latest" rather
-- than "first".
alter table game.sessions
  add column if not exists original_snacks_total numeric,
  add column if not exists snack_edit_reason      text,
  add column if not exists snack_edited_by        uuid references auth.users (id),
  add column if not exists snack_edited_at        timestamptz;

comment on column game.sessions.original_snacks_total is
  'What this session''s snacks totalled before an admin edited the order lines. Null = never edited.';

-- ── 2. The correction itself ────────────────────────────────────────────────
-- p_changes is a JSON array of:
--   {"kind":"add",     "product_id": uuid, "qty": int}
--   {"kind":"remove",  "order_line_id": uuid}
--   {"kind":"set_qty", "order_line_id": uuid, "qty": int}
-- One call, one reason, one audit row, whatever the mix - the UI batches
-- however many taps an admin makes into one submit, exactly like correct_session
-- takes one new duration and one reason rather than a stream of edits.
create or replace function game.edit_session_snacks(
  p_session_id uuid,
  p_changes    jsonb,
  p_reason     text
)
returns game.sessions
language plpgsql security definer
set search_path = game, public as $$
declare
  s               sessions%rowtype;
  ol              order_lines%rowtype;
  p               products%rowtype;
  v_change        jsonb;
  v_kind          text;
  v_product_id    uuid;
  v_order_line_id uuid;
  v_qty           int;
  v_delta         int;
  v_snacks        numeric;
  v_change_count  int;
  v_now           timestamptz := now();
begin
  -- Any active staff, same widening correct_session already got: a normal
  -- admin can fix what they typed wrong, not just a superadmin.
  if not game.is_active_staff() then
    raise exception 'Only active staff can edit a session''s snacks.' using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;
  if p_changes is null or jsonb_typeof(p_changes) <> 'array' or jsonb_array_length(p_changes) = 0 then
    raise exception 'At least one change is required.' using errcode = '22023';
  end if;

  select * into s from sessions where id = p_session_id for update;
  if not found then
    raise exception 'Unknown session.' using errcode = '23503';
  end if;
  -- An open session already has its own add/remove door on the session
  -- screen; this one is for after close_session has run.
  if s.status <> 'closed' then
    raise exception 'That session is still open. Add or remove items from the session screen instead.'
      using errcode = '23514';
  end if;
  -- Same rule as correct_session: a cancelled session is terminal, and
  -- editing its snacks would quietly put stock/revenue back on a row the
  -- owner already decided to zero.
  if s.void_reason is not null then
    raise exception 'That session was cancelled. A cancelled session''s snacks cannot be edited.'
      using errcode = '23514';
  end if;

  v_change_count := jsonb_array_length(p_changes);

  for v_change in select * from jsonb_array_elements(p_changes)
  loop
    v_kind := v_change->>'kind';

    if v_kind = 'add' then
      v_product_id := nullif(v_change->>'product_id', '')::uuid;
      v_qty        := (v_change->>'qty')::int;
      if v_product_id is null then
        raise exception 'Unknown product.' using errcode = '23503';
      end if;
      if v_qty is null or v_qty <= 0 then
        raise exception 'Quantity must be at least one.' using errcode = '22023';
      end if;

      select * into p from products where id = v_product_id for update;
      if not found then
        raise exception 'Unknown product.' using errcode = '23503';
      end if;
      if not p.active then
        raise exception '% is no longer on sale.', p.name_en using errcode = '23514';
      end if;
      if p.stock is not null and p.stock < v_qty then
        raise exception 'Not enough % in stock (% left, % requested).',
          p.name_en, p.stock, v_qty using errcode = '23514';
      end if;

      insert into order_lines (session_id, product_id, product_name, qty, unit_price, line_total)
      values (s.id, p.id, p.name_en, v_qty, p.price, p.price * v_qty);

      -- Byte-for-byte add_session_item's stock step: only tracked products
      -- (stock is not null) move the shelf count or leave a ledger row.
      if p.stock is not null then
        update products set stock = stock - v_qty where id = p.id;
        insert into stock_movements (product_id, change, reason, session_id, created_by, note)
          values (p.id, -v_qty, 'sale', s.id, auth.uid(), btrim(p_reason));
      end if;

    elsif v_kind = 'remove' then
      v_order_line_id := nullif(v_change->>'order_line_id', '')::uuid;
      if v_order_line_id is null then
        raise exception 'That item is not on the order.' using errcode = '23503';
      end if;

      -- Scoped to THIS session - an order-line id from a different session
      -- (tampered or stale) is treated as not found, not silently edited.
      select * into ol from order_lines
       where id = v_order_line_id and session_id = s.id for update;
      if not found then
        raise exception 'That item is not on this session''s order.' using errcode = '23503';
      end if;

      -- Byte-for-byte remove_session_item's stock step: logged whenever the
      -- line still names a product, whether or not that product tracks stock.
      if ol.product_id is not null then
        update products set stock = stock + ol.qty
         where id = ol.product_id and stock is not null;
        insert into stock_movements (product_id, change, reason, session_id, created_by, note)
          values (ol.product_id, ol.qty, 'void_return', s.id, auth.uid(), btrim(p_reason));
      end if;

      delete from order_lines where id = ol.id;

    elsif v_kind = 'set_qty' then
      v_order_line_id := nullif(v_change->>'order_line_id', '')::uuid;
      v_qty           := (v_change->>'qty')::int;
      if v_order_line_id is null then
        raise exception 'That item is not on the order.' using errcode = '23503';
      end if;
      -- Zero is not a quantity here - the UI turns "stepped down to zero"
      -- into a `remove` change before this is ever called. This is only the
      -- backstop for a caller that skips the UI.
      if v_qty is null or v_qty <= 0 then
        raise exception 'Quantity must be at least one; remove the item instead.'
          using errcode = '22023';
      end if;

      select * into ol from order_lines
       where id = v_order_line_id and session_id = s.id for update;
      if not found then
        raise exception 'That item is not on this session''s order.' using errcode = '23503';
      end if;

      -- unit_price is never touched - the historical snapshot stays exactly
      -- what it was, the same principle correct_session applies to rate_per_hour.
      v_delta := v_qty - ol.qty;
      if v_delta <> 0 and ol.product_id is not null then
        select * into p from products where id = ol.product_id for update;
        if found and p.stock is not null then
          if v_delta > 0 and p.stock < v_delta then
            raise exception 'Not enough % in stock (% left, % more requested).',
              p.name_en, p.stock, v_delta using errcode = '23514';
          end if;
          update products set stock = stock - v_delta where id = p.id;
          insert into stock_movements (product_id, change, reason, session_id, created_by, note)
            values (ol.product_id, -v_delta,
                    case when v_delta > 0 then 'sale' else 'void_return' end,
                    s.id, auth.uid(), btrim(p_reason));
        end if;
      end if;

      update order_lines set qty = v_qty, line_total = ol.unit_price * v_qty
       where id = ol.id;

    else
      raise exception 'Unknown change kind %.', v_kind using errcode = '22023';
    end if;
  end loop;

  -- snacks_total/total are not maintained incrementally anywhere in this
  -- schema (close_session sums order_lines exactly once, at the moment of
  -- closing) - so this is the only place that re-sums them for a session
  -- that was already closed.
  select coalesce(sum(line_total), 0) into v_snacks from order_lines where session_id = s.id;

  update sessions set
    original_snacks_total = coalesce(s.original_snacks_total, s.snacks_total),
    snacks_total           = v_snacks,
    -- playtime_total is never read or written here. That is what lets a time
    -- correction and a snack edit land on the same session, in either order,
    -- and still add up: each only ever rewrites its own half of `total`.
    total                  = s.playtime_total + v_snacks,
    snack_edit_reason      = btrim(p_reason),
    snack_edited_by        = auth.uid(),
    snack_edited_at        = v_now
  where id = s.id
  returning * into s;

  -- No exception handler, same reasoning as correct_session: back-office
  -- work, nobody waiting at a till, a correction that cannot be recorded must
  -- not happen.
  perform public.audit(
    'game', 'session.snacks_corrected',
    format('Adjusted snacks on %s (%s change%s). %s -> %s. Reason: %s',
           coalesce(s.station_name, 'a station'), v_change_count,
           case when v_change_count = 1 then '' else 's' end,
           coalesce(s.original_snacks_total, 0), s.snacks_total, btrim(p_reason)),
    'session', s.id::text, s.station_name,
    jsonb_build_object(
      'station',                s.station_name,
      'reason',                 btrim(p_reason),
      'changes',                p_changes,
      'original_snacks_total',  s.original_snacks_total,
      'snacks_total',           s.snacks_total,
      'total',                  s.total
    ),
    auth.uid()
  );

  return s;
end $$;

-- ── 3. Stop the checkout audit trigger firing on a snack edit too ───────────
-- It fires `after update of total`, already guarded against a duration
-- correction re-firing it (game-correct-session-migration.sql). A snack edit
-- also updates total without touching corrected_at, so without this it would
-- write a second, wrong "session closed" audit row on every snack edit.
drop trigger if exists audit_game_session_recorded on game.sessions;
create trigger audit_game_session_recorded
  after update of total on game.sessions
  for each row
  when (new.void_reason is null and old.void_reason is null
        and new.corrected_at is not distinct from old.corrected_at
        and new.snack_edited_at is not distinct from old.snack_edited_at)
  execute function public.audit_game_session_recorded();

-- ── 4. Grants ───────────────────────────────────────────────────────────────
revoke all on function game.edit_session_snacks(uuid, jsonb, text) from public, anon;
grant execute on function game.edit_session_snacks(uuid, jsonb, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   -- as a plain admin, on a real closed, non-voided session with a snack on it:
--   select game.edit_session_snacks(
--     '<closed session id>',
--     jsonb_build_array(
--       jsonb_build_object('kind','add','product_id','<product id>','qty',1)
--     ),
--     'test: forgot to ring up a snack'
--   );
--   select id, snacks_total, total, original_snacks_total, snack_edit_reason, snack_edited_at
--     from game.sessions where snack_edited_at is not null order by snack_edited_at desc;
--   -- must NOT have written a second "session.closed"/"session.recorded" audit row
--   -- for that session at the same timestamp as the snack edit.
--   -- blocked cases (all should raise 23514):
--   select game.edit_session_snacks('<an OPEN session id>', jsonb_build_array(jsonb_build_object('kind','remove','order_line_id','<id>')), 'test');
--   select game.edit_session_snacks('<a VOIDED session id>', jsonb_build_array(jsonb_build_object('kind','remove','order_line_id','<id>')), 'test');
