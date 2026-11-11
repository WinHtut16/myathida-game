-- ============================================================
-- game-rewards-seed.sql
--
-- Run in the FUTSAL Supabase project, after loyalty-zone-admin-migration.sql
-- (hub). SAFE TO RE-RUN: yes, a reward with the same name is not added twice.
--
-- The ACJ Gaming rewards the client confirmed on 2026-11-11. Points cost
-- matches 10 hours of play on each tier at the tier's points per hour
-- (game-tier-points-migration.sql: PS4 3, PS5 5, VIP/CINEMA 7).
--
-- Instead of this file the owner can add the same three on
-- /admin/game/points/rewards. Either way, after that the rewards are edited
-- there, not here.
--
-- Using one: the customer requests it on /games/account, staff approve it in
-- Points > Requests (the points come off then), and staff run that hour free
-- at the counter (waive it on checkout).
-- ============================================================

insert into public.rewards (app, name, name_my, description, description_my, points_cost, stock, is_active)
select 'game', v.name, v.name_my, v.description, v.description_my, v.cost, null, true
  from (values
    ('PS4 – 1 hour free', 'PS4 – ၁ နာရီ အခမဲ့',
     'One free hour on a PS4 screen.', 'PS4 TV တစ်လုံးတွင် ၁ နာရီ အခမဲ့ ကစားခွင့်။', 30),
    ('PS5 – 1 hour free', 'PS5 – ၁ နာရီ အခမဲ့',
     'One free hour on a PS5 screen.', 'PS5 TV တစ်လုံးတွင် ၁ နာရီ အခမဲ့ ကစားခွင့်။', 50),
    ('VIP room or mini cinema – 1 hour free', 'VIP အခန်း သို့မဟုတ် မီနီရုပ်ရှင်ရုံ – ၁ နာရီ အခမဲ့',
     'One free hour in the VIP room or on a mini-cinema TV.',
     'VIP အခန်း သို့မဟုတ် မီနီရုပ်ရှင်ရုံ TV တွင် ၁ နာရီ အခမဲ့။', 70)
  ) as v(name, name_my, description, description_my, cost)
 where not exists (
   select 1 from public.rewards r
    where r.app = 'game' and r.name = v.name and not r.is_deleted
 );

-- ── VERIFY ──────────────────────────────────────────────────────────────────
--   select name, points_cost, is_active from public.rewards
--    where app = 'game' and not is_deleted order by points_cost;
