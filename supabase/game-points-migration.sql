-- ============================================================
-- Game shop points: attach a customer to a session, earn on close.
--
-- Needs, in the hub (PointSystem_AkoATP), in this order:
--   multi-business-points-migration.sql -> session-points-migration.sql
-- and here: game-live-sessions-migration.sql, game-pricing-tiers-migration.sql.
--
-- 1. game.sessions gets customer_id (+ name/phone copied for display: this
--    zone cannot join to public.profiles through its own API) and
--    points_rule (the rule frozen when the session first earned).
-- 2. One BEFORE trigger hands every relevant change - close, typed-in
--    session, correction, void, customer change - to
--    public.sync_session_points(), which posts only the difference.
--    Points are 10 per full 60 PAID minutes (charged_minutes, i.e. after
--    waived blocks), per public.point_rules.
--    If points ever fail, the till does NOT stop: the error is logged as a
--    warning and the next change to that session catches it up.
-- 3. game.set_session_customer(): staff attach a registered customer by
--    phone while the session runs, or within 15 minutes of it finishing
--    if it has none yet (covers a typed-in session and "forgot to ask").
--    Changing the customer of a finished session after that: superadmin,
--    and audited. Entering the SAME phone again re-syncs the points (the
--    repair path if points failed at checkout).
-- 4. Fix: record_session had no running-timer guard and no station lock,
--    so typing in a session on a busy TV freed it while its timer ran.
--    Same guard billiards already has. Body otherwise identical to the
--    live definition (dumped 2026-11-07).
-- Safe to re-run.
-- ============================================================

do $$
begin
  if to_regprocedure('public.sync_session_points(text,uuid,uuid,boolean,integer,jsonb)') is null then
    raise exception 'Run the hub''s session-points-migration.sql first.';
  end if;
  if not exists (select 1 from information_schema.columns
                 where table_schema = 'game' and table_name = 'sessions' and column_name = 'charged_minutes') then
    raise exception 'game.sessions is missing charged_minutes - run the earlier game migrations first.';
  end if;
end $$;

begin;

-- ------------------------------------------------------------
-- 1. Columns
-- ------------------------------------------------------------
alter table game.sessions
  add column if not exists customer_id    uuid references public.profiles(id) on delete set null,
  add column if not exists customer_name  text,
  add column if not exists customer_phone text,
  add column if not exists points_rule    jsonb;

create index if not exists game_sessions_customer_idx
  on game.sessions (customer_id) where customer_id is not null;

-- ------------------------------------------------------------
-- 2. Trigger: keep the ledger in step with the session
-- ------------------------------------------------------------
create or replace function game.sync_session_points_trg()
returns trigger
language plpgsql
security definer
set search_path = game, public
as $$
begin
  if tg_op = 'UPDATE'
     and new.customer_id     is not distinct from old.customer_id
     and new.status          is not distinct from old.status
     and new.charged_minutes is not distinct from old.charged_minutes
     and new.void_reason     is not distinct from old.void_reason then
    return new;   -- nothing that affects points changed (snacks, label...)
  end if;

  if new.customer_id is null and (tg_op = 'INSERT' or old.customer_id is null) then
    return new;   -- nobody to pay and nobody to take back from
  end if;

  begin
    new.points_rule := public.sync_session_points(
      'game', new.id, new.customer_id,
      new.status = 'closed' and new.void_reason is null,
      new.charged_minutes, new.points_rule);
  exception when others then
    -- The till must not stop because points did. Rolled back to here; the
    -- next change to this session re-syncs it.
    raise warning 'game points sync failed for session %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke all on function game.sync_session_points_trg() from public, anon, authenticated;

-- zz_: BEFORE triggers fire in name order; this must see the final row.
drop trigger if exists zz_game_session_points on game.sessions;
create trigger zz_game_session_points
  before insert or update on game.sessions
  for each row execute function game.sync_session_points_trg();

-- ------------------------------------------------------------
-- 3. Attaching a customer
-- ------------------------------------------------------------
-- p_phone empty = remove the customer. Returns who is attached now and
-- the points this session has given them.
create or replace function game.set_session_customer(p_session_id uuid, p_phone text)
returns jsonb
language plpgsql
security definer
set search_path = game, public
as $$
declare
  s        game.sessions%rowtype;
  v_id     uuid;
  v_name   text;
  v_phone  text;
  v_points int;
  v_late   boolean;
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised to run sessions for the game shop.' using errcode = '42501';
  end if;

  select * into s from game.sessions where id = p_session_id for update;
  if not found then
    raise exception 'Unknown session.' using errcode = '23503';
  end if;
  if s.void_reason is not null then
    raise exception 'That session was cancelled. It cannot earn points.' using errcode = '23514';
  end if;

  if btrim(coalesce(p_phone, '')) <> '' then
    select c.id, c.username, c.phone into v_id, v_name, v_phone
      from public.find_customer_by_phone(p_phone) c
     limit 1;
    if v_id is null then
      raise exception 'No customer is registered with that phone number. Ask them to sign up first.'
        using errcode = 'P0002';
    end if;
  end if;

  -- Routine: running session, or a finished one that has no customer yet
  -- and finished in the last 15 minutes. Anything else is a late change.
  v_late := s.status = 'closed'
            and not (s.customer_id is null
                     and coalesce(s.ended_at, s.created_at) > now() - interval '15 minutes');
  if v_late and v_id is distinct from s.customer_id and not game.is_superadmin() then
    raise exception 'Only a superadmin can change the customer on a finished session.'
      using errcode = '42501';
  end if;

  if v_id is not distinct from s.customer_id then
    -- Same customer again: re-sync. This is how staff repair a session
    -- whose points failed at checkout (the trigger logged a warning).
    update game.sessions
       set points_rule = public.sync_session_points(
             'game', s.id, s.customer_id, s.status = 'closed' and s.void_reason is null,
             s.charged_minutes, s.points_rule)
     where id = s.id and s.customer_id is not null;
  else
    update game.sessions
       set customer_id = v_id, customer_name = v_name, customer_phone = v_phone
     where id = s.id;

    if v_late then
      perform public.audit(
        'game', 'session.customer_set',
        format('%s the customer of a finished session on %s%s.',
               case when v_id is null then 'Removed' else 'Set' end,
               coalesce(s.station_name, 'a station'),
               case when v_id is null then '' else ' to ' || v_name end),
        'session', s.id::text, s.station_name,
        jsonb_build_object('from', s.customer_name, 'to', v_name),
        auth.uid());
    end if;
  end if;

  select coalesce(sum(points_delta), 0)::int into v_points
    from public.point_transactions
   where app = 'game' and source_session_id = s.id and customer_id = v_id;

  return jsonb_build_object('customer_id', v_id, 'username', v_name, 'phone', v_phone,
                            'points', v_points);
end $$;

revoke all on function game.set_session_customer(uuid, text) from public, anon;
grant execute on function game.set_session_customer(uuid, text) to authenticated, service_role;

-- ------------------------------------------------------------
-- 4. record_session: refuse a station whose timer is running
-- ------------------------------------------------------------
create or replace function game.record_session(p_station_id uuid, p_minutes integer, p_items jsonb default '[]'::jsonb, p_label text default null::text)
returns uuid
language plpgsql
security definer
set search_path to 'game', 'public'
as $function$
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

  -- for update + the running check: a typed-in session must not free a
  -- station whose timer is running. [NEW]
  select * into v_station from game.stations where id = p_station_id for update;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;
  if exists (select 1 from game.sessions where station_id = v_station.id and status = 'active') then
    raise exception '% has a session running. Close it there instead.', v_station.name
      using errcode = '23514';
  end if;

  select * into v_pricing from game.pricing where tier = v_station.tier;
  if not found then
    raise exception 'No pricing configured for tier %.', v_station.tier
      using errcode = '23503';
  end if;

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
end $function$;

revoke all on function game.record_session(uuid, int, jsonb, text) from public, anon;
grant execute on function game.record_session(uuid, int, jsonb, text) to authenticated;

commit;
