-- ============================================================
-- game-cinema-tier-migration.sql
--
-- Run in the FUTSAL Supabase project (mmyjtvlnuizpwktpkuij), after
-- game-pricing-tiers-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- The client is adding mini-cinema TVs. They are a fourth station category,
-- 'CINEMA', next to PS4 / PS5 / VIP. The tier is a plain text column guarded by
-- an inline CHECK on three tables (stations, pricing, sessions), not a Postgres
-- enum, so widening it means replacing those three CHECK constraints.
--
-- A tier is also a pricing key: game.open_session and record_session refuse a
-- tier that has no pricing row. So this seeds a CINEMA row, copying PS4's
-- settings as a PLACEHOLDER (60 min = 3000, 30 min = 2000). The superadmin must
-- set the real cinema prices on the Pricing page.
-- ============================================================

do $$
begin
  if to_regclass('game.pricing_tiers') is null then
    raise exception 'game.pricing_tiers not found. Run game-pricing-tiers-migration.sql first.';
  end if;
end $$;

-- ── 1. Widen the tier CHECK on stations, pricing, sessions ──────────────────
-- Constraint names come from Postgres's auto-naming of the inline checks; look
-- them up by definition instead of trusting the name, so a renamed constraint
-- cannot make this silently miss.
do $$
declare
  v_table text;
  v_con   text;
begin
  foreach v_table in array array['stations', 'pricing', 'sessions'] loop
    for v_con in
      select con.conname
        from pg_constraint con
        join pg_class rel on rel.oid = con.conrelid
        join pg_namespace nsp on nsp.oid = rel.relnamespace
       where nsp.nspname = 'game'
         and rel.relname = v_table
         and con.contype = 'c'
         and pg_get_constraintdef(con.oid) ilike '%tier%'
         and pg_get_constraintdef(con.oid) ilike '%PS4%'
    loop
      execute format('alter table game.%I drop constraint %I', v_table, v_con);
    end loop;

    execute format(
      'alter table game.%I add constraint %I check (tier in (''PS4'',''PS5'',''VIP'',''CINEMA''))',
      v_table, v_table || '_tier_check'
    );
  end loop;
end $$;

-- ── 2. Placeholder CINEMA pricing (superadmin edits on the Pricing page) ────
-- Copy PS4's min/increment/grace so the billing behaviour is a known quantity.
insert into game.pricing (tier, rate_per_hour, min_minutes, increment_minutes, grace_minutes)
select 'CINEMA', rate_per_hour, min_minutes, increment_minutes, grace_minutes
  from game.pricing
 where tier = 'PS4'
on conflict (tier) do nothing;

insert into game.pricing_tiers (tier, duration_minutes, rate) values
  ('CINEMA', 60, 3000),
  ('CINEMA', 30, 2000)
on conflict (tier, duration_minutes) do nothing;

notify pgrst, 'reload schema';

-- ── VERIFY (run by hand) ────────────────────────────────────────────────────
--   select conrelid::regclass, conname, pg_get_constraintdef(oid)
--     from pg_constraint
--    where conname in ('stations_tier_check','pricing_tier_check','sessions_tier_check');
--   select tier, rate_per_hour, min_minutes, increment_minutes, grace_minutes from game.pricing order by tier;
--   select tier, duration_minutes, rate from game.pricing_tiers where tier = 'CINEMA' order by duration_minutes;
