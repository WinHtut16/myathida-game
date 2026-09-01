-- ============================================================
-- game-corrections-migration.sql
--
-- Two things the game shop is missing that billiards has had for months:
--   1. a way to correct a mistyped session
--   2. a stock movements ledger
--
-- Run in the FUTSAL Supabase project (mmyjtvlnuizpwktpkuij), after
-- game-schema-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- game.sessions was written immutable, with a comment claiming "a correction
-- is a new row" - and nothing was ever built to write that row. So a staff
-- member who types 90 minutes instead of 19 makes the takings permanently
-- wrong, with no path back. That is the single most expensive gap in this app.
--
-- The fix follows billiards rather than the comment. Billiards zeroes the
-- charge ON the row and stamps it voided, instead of inserting a reversing
-- row. That is the better design and I am changing my mind about it here: a
-- correcting row means every total in Reports must remember to net the pair,
-- and the first aggregate that forgets silently reports money that was never
-- taken. Zeroing in place makes every existing sum correct with no special
-- case, while void_reason/voided_by/voided_at keep the audit trail - nothing
-- is deleted and the mistake stays visible.
-- ============================================================

do $$
begin
  if to_regclass('game.sessions') is null then
    raise exception 'game schema not found. Run game-schema-migration.sql first.';
  end if;
end $$;

-- ── Correction bookkeeping on the session row ───────────────────────────────
alter table game.sessions
  add column if not exists void_reason text,
  add column if not exists voided_by   uuid references auth.users (id),
  add column if not exists voided_at   timestamptz;

comment on column game.sessions.void_reason is
  'Set when a session was corrected. The row is kept and its charge zeroed, never deleted.';

-- ── Stock movements ─────────────────────────────────────────────────────────
-- products.stock alone answers "how many are there" and nothing else. When the
-- count disagrees with the shelf - which it eventually will - there is no way
-- to find out why. Every change to stock now leaves a row here saying how
-- much, why, and who.
create table if not exists game.stock_movements (
  id         uuid primary key default gen_random_uuid(),
  product_id uuid not null references game.products (id) on delete cascade,
  -- Signed: negative for a sale, positive for a restock or a returned void.
  change     integer not null check (change <> 0),
  reason     text not null check (reason in ('sale','restock','adjustment','void_return')),
  session_id uuid references game.sessions (id) on delete set null,
  note       text,
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);

create index if not exists idx_stock_movements_product on game.stock_movements (product_id, created_at desc);
create index if not exists idx_stock_movements_created on game.stock_movements (created_at desc);

alter table game.stock_movements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policy where polname = 'stock_movements_select') then
    create policy stock_movements_select on game.stock_movements
      for select using (game.is_active_staff());
  end if;
end $$;
-- No write policy: rows are only ever written by the SECURITY DEFINER
-- functions below, so a movement cannot be recorded without the stock change
-- that caused it.

-- ── record_session now leaves a trail for each item sold ────────────────────
-- Identical to the existing function except for the stock_movements insert
-- beside each decrement. Repeated in full because create-or-replace has no
-- way to patch a body.
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

  update game.stations set occupied = false where id = v_station.id;

  return v_session;
end $$;

-- ── Correcting a recorded session ───────────────────────────────────────────
create or replace function game.void_session(
  p_session_id  uuid,
  p_reason      text,
  p_void_snacks boolean default false
)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  s  game.sessions%rowtype;
  ol record;
  v_snacks numeric;
begin
  -- Superadmin only. Zeroing takings is exactly the operation someone would
  -- reach for to hide a till discrepancy, so it stays with the owner.
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can correct a recorded session.'
      using errcode = '42501';
  end if;
  if p_reason is null or btrim(p_reason) = '' then
    raise exception 'A reason is required.' using errcode = '22023';
  end if;

  -- for update: two people correcting the same session at once would otherwise
  -- return stock twice.
  select * into s from game.sessions
   where id = p_session_id and void_reason is null
   for update;
  if not found then
    raise exception 'Session not found, or it has already been corrected.'
      using errcode = '23503';
  end if;

  v_snacks := s.snacks_total;

  -- Snacks are optional to reverse, and default to NOT reversing: the usual
  -- correction is a mistyped duration, where the customer really did drink the
  -- Coke. Returning it to stock by default would quietly inflate the shelf
  -- count every time someone fixed a typo.
  if p_void_snacks then
    for ol in select product_id, qty from game.order_lines where session_id = s.id
    loop
      if ol.product_id is not null then
        update game.products
           set stock = stock + ol.qty
         where id = ol.product_id and stock is not null;

        insert into game.stock_movements
          (product_id, change, reason, session_id, created_by, note)
        values
          (ol.product_id, ol.qty, 'void_return', s.id, auth.uid(), p_reason);
      end if;
    end loop;
    v_snacks := 0;
  end if;

  update game.sessions
     set playtime_total = 0,
         snacks_total   = v_snacks,
         total          = v_snacks,
         void_reason    = btrim(p_reason),
         voided_by      = auth.uid(),
         voided_at      = now()
   where id = s.id;
end $$;

-- ── Restocking, with the movement recorded ──────────────────────────────────
-- Superadmin only, matching futsal, where stock has always been the owner's.
-- An absolute count rather than a delta: staff count the shelf, and "there are
-- 14" can be checked where "add 6" is only right if the number already was.
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
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can change stock.' using errcode = '42501';
  end if;
  if p_stock is not null and p_stock < 0 then
    raise exception 'Stock cannot be negative.' using errcode = '22023';
  end if;

  select stock into v_old from game.products where id = p_product_id for update;
  if not found then
    raise exception 'Unknown product.' using errcode = '23503';
  end if;

  update game.products set stock = p_stock where id = p_product_id;

  -- Only a real change is worth a row. Moving to or from "not tracked" (null)
  -- has no numeric delta to record, so it changes the product without
  -- inventing a movement.
  if p_stock is not null and v_old is not null then
    v_delta := p_stock - v_old;
    if v_delta <> 0 then
      insert into game.stock_movements (product_id, change, reason, created_by, note)
      values (p_product_id, v_delta,
              case when v_delta > 0 then 'restock' else 'adjustment' end,
              auth.uid(), p_note);
    end if;
  end if;
end $$;

revoke all on function game.void_session(uuid, text, boolean) from public;
revoke all on function game.set_stock(uuid, integer, text)    from public;
grant execute on function game.void_session(uuid, text, boolean) to authenticated;
grant execute on function game.set_stock(uuid, integer, text)    to authenticated;
grant execute on function game.record_session(uuid, int, jsonb, text) to authenticated;
