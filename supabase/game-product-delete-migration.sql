-- ============================================================
-- game-product-delete-migration.sql
--
-- Run in the FUTSAL Supabase project (mmyjtvlnuizpwktpkuij), after
-- game-schema-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- The catalogue screen could only DELIST a snack (active = false), never
-- remove it. There was no delete path at all, and a hard delete would have
-- failed anyway: game.order_lines.product_id references game.products with the
-- default ON DELETE (NO ACTION), so any snack that had ever been sold was
-- undeletable.
--
-- order_lines already snapshots product_name onto every row, and both the
-- Reports receipts and the stock-history panel already tolerate a null
-- product_id ("Deleted product"). So the fix is:
--   1. relax the FK to ON DELETE SET NULL - deleting a sold snack keeps the
--      sale, it just unlinks it from the (now gone) catalogue row;
--   2. add game.delete_product(), superadmin-only, the single delete path.
-- game.stock_movements.product_id is already ON DELETE CASCADE, so a deleted
-- product's ledger rows (its only consumer is the same panel) go with it.
-- ============================================================

do $$
begin
  if to_regclass('game.order_lines') is null then
    raise exception 'game schema not found. Run game-schema-migration.sql first.';
  end if;
end $$;

-- ── 1. order_lines.product_id -> ON DELETE SET NULL ─────────────────────────
do $$
declare
  v_con text;
  v_rule text;
begin
  select con.conname,
         con.confdeltype
    into v_con, v_rule
    from pg_constraint con
    join pg_class rel on rel.oid = con.conrelid
    join pg_namespace nsp on nsp.oid = rel.relnamespace
   where nsp.nspname = 'game'
     and rel.relname = 'order_lines'
     and con.contype = 'f'
     and (select attname
            from pg_attribute
           where attrelid = con.conrelid
             and attnum = con.conkey[1]) = 'product_id';

  if v_con is null then
    raise exception 'FK on game.order_lines.product_id not found.';
  end if;

  -- confdeltype 'n' == SET NULL. Already done? Then this is a re-run, skip.
  if v_rule is distinct from 'n' then
    execute format('alter table game.order_lines drop constraint %I', v_con);
    alter table game.order_lines
      add constraint order_lines_product_id_fkey
      foreign key (product_id) references game.products (id) on delete set null;
  end if;
end $$;

-- ── 2. delete_product() ────────────────────────────────────────────────────
create or replace function game.delete_product(p_id uuid)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  v_found uuid;
begin
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can change the catalogue.' using errcode = '42501';
  end if;

  delete from game.products where id = p_id returning id into v_found;
  if v_found is null then
    raise exception 'Unknown product.' using errcode = '23503';
  end if;
end $$;

revoke all on function game.delete_product(uuid) from public;
grant execute on function game.delete_product(uuid) to authenticated;
