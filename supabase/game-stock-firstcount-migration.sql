-- ============================================================
-- game-stock-firstcount-migration.sql
--
-- Run in the FUTSAL Supabase project (mmyjtvlnuizpwktpkuij), after
-- game-corrections-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- game.set_stock() records a stock_movements row for every numeric change,
-- EXCEPT the first one: its guard is `if p_stock is not null and v_old is not
-- null`, so setting a count on a product that was previously "not tracked"
-- (stock = null) changed the number and logged nothing. To the owner that
-- looks like the ledger is broken - they set a stock and "Recent stock
-- changes" stays empty.
--
-- This redefines set_stock so a first count (null -> number) is logged as a
-- 'restock' of the full amount. The only case still deliberately unlogged is
-- number -> null ("stop tracking this"), which has no numeric delta.
--
-- create-or-replace has no way to patch a body, so the function is repeated in
-- full. It is otherwise byte-for-byte the version in
-- game-corrections-migration.sql.
-- ============================================================

do $$
begin
  if to_regclass('game.stock_movements') is null then
    raise exception 'game.stock_movements not found. Run game-corrections-migration.sql first.';
  end if;
end $$;

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
