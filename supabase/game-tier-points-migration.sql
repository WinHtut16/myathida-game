-- ============================================================
-- game-tier-points-migration.sql
--
-- Run in the FUTSAL Supabase project, after game-points-migration.sql and
-- game-cinema-tier-migration.sql. SAFE TO RE-RUN: yes.
--
-- ── Why this exists ─────────────────────────────────────────────────────────
-- Client rule (2026-11-11): ACJ Gaming points depend on the station tier,
-- per FULL hour played, no part hours:
--   PS4 = 3, PS5 = 5, VIP = 7, CINEMA (mini cinema) = 7.
-- Before this, every tier earned the one flat public.point_rules('game')
-- rule (10 per 60 min).
--
-- ── How ────────────────────────────────────────────────────────────────────
-- 1. game.pricing.points_per_hour: one number per tier, edited on the
--    Pricing page next to the price.
-- 2. game.session_point_rule(): builds the rule a session should freeze.
--    The shared engine public.sync_session_points() already accepts a rule
--    (p_rule) and freezes it on the session, so the engine and billiards are
--    NOT touched. public.point_rules('game').is_active stays the on/off
--    switch for the whole shop; its block/points columns are no longer used
--    for new game sessions.
-- 3. The game trigger and set_session_customer's repair path pass that rule
--    in. Sessions that already froze a rule (the old 10 per hour) keep it:
--    history does not change.
-- ============================================================

do $$
begin
  if to_regprocedure('public.sync_session_points(text,uuid,uuid,boolean,integer,jsonb)') is null then
    raise exception 'Run the hub''s session-points-migration.sql first.';
  end if;
  if to_regprocedure('game.sync_session_points_trg()') is null then
    raise exception 'Run game-points-migration.sql first.';
  end if;
  if not exists (select 1 from game.pricing where tier = 'CINEMA') then
    raise exception 'No CINEMA pricing row. Run game-cinema-tier-migration.sql first.';
  end if;
end $$;

begin;

-- ------------------------------------------------------------
-- 1. Points per hour, per tier
-- ------------------------------------------------------------
alter table game.pricing
  add column if not exists points_per_hour integer not null default 0;

do $$
begin
  if not exists (select 1 from pg_constraint
                  where conrelid = 'game.pricing'::regclass
                    and conname = 'pricing_points_per_hour_check') then
    alter table game.pricing
      add constraint pricing_points_per_hour_check check (points_per_hour between 0 and 100000);
  end if;
end $$;

-- Seed the client's numbers only where nothing was set yet (re-run safe,
-- never overwrites an owner's later edit).
update game.pricing p
   set points_per_hour = v.pts
  from (values ('PS4', 3), ('PS5', 5), ('VIP', 7), ('CINEMA', 7)) as v(tier, pts)
 where p.tier = v.tier and p.points_per_hour = 0;

-- ------------------------------------------------------------
-- 1b. Cinema price = VIP price (client, 2026-11-11: 7000 MMK an hour)
-- ------------------------------------------------------------
-- game-cinema-tier-migration.sql seeded CINEMA as a PS4 placeholder
-- (60 min 3000, 30 min 2000). Copy VIP's whole rate card and billing rules
-- over it, but only while CINEMA still holds exactly that placeholder, so a
-- re-run never overwrites a price the owner set on the Pricing page.
-- rate_per_hour follows by itself (trigger mirrors the 60-minute row).
do $$
begin
  if (select array_agg(duration_minutes || ':' || rate order by duration_minutes)
        from game.pricing_tiers where tier = 'CINEMA') = array['30:2000', '60:3000'] then
    delete from game.pricing_tiers where tier = 'CINEMA';
    insert into game.pricing_tiers (tier, duration_minutes, rate)
    select 'CINEMA', duration_minutes, rate from game.pricing_tiers where tier = 'VIP';

    update game.pricing c
       set min_minutes = v.min_minutes,
           increment_minutes = v.increment_minutes,
           grace_minutes = v.grace_minutes
      from game.pricing v
     where c.tier = 'CINEMA' and v.tier = 'VIP';
  end if;
end $$;

-- ------------------------------------------------------------
-- 2. The rule a session should freeze
-- ------------------------------------------------------------
-- p_frozen non-null: already frozen, keep it.
-- Not yet earning (open, voided, or no customer): return NULL so nothing is
-- frozen early - the engine freezes on the first award, as before.
-- Otherwise: 60-minute blocks, the tier's points_per_hour, active only if
-- the shop's switch (point_rules 'game') is on. A missing tier row or a
-- missing switch row freezes "off" (0 points), never an error.
create or replace function game.session_point_rule(
  p_tier        text,
  p_frozen      jsonb,
  p_customer_id uuid,
  p_eligible    boolean
)
returns jsonb
language sql
stable
security definer
set search_path = game, public
as $$
  select case
    when p_frozen is not null then p_frozen
    when p_customer_id is null or not coalesce(p_eligible, false) then null
    else jsonb_build_object(
      'block_minutes',    60,
      'points_per_block', coalesce((select points_per_hour from game.pricing where tier = p_tier), 0),
      'is_active',        coalesce((select is_active from public.point_rules where app = 'game'), false),
      'tier',             p_tier)
  end;
$$;

revoke all on function game.session_point_rule(text, jsonb, uuid, boolean) from public, anon, authenticated;

-- ------------------------------------------------------------
-- 3. Trigger: same as game-points-migration.sql, plus the tier rule
-- ------------------------------------------------------------
create or replace function game.sync_session_points_trg()
returns trigger
language plpgsql
security definer
set search_path = game, public
as $$
declare
  v_eligible boolean;
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

  v_eligible := new.status = 'closed' and new.void_reason is null;

  begin
    new.points_rule := public.sync_session_points(
      'game', new.id, new.customer_id, v_eligible, new.charged_minutes,
      game.session_point_rule(new.tier, new.points_rule, new.customer_id, v_eligible));
  exception when others then
    -- The till must not stop because points did. Rolled back to here; the
    -- next change to this session re-syncs it.
    raise warning 'game points sync failed for session %: %', new.id, sqlerrm;
  end;
  return new;
end $$;

revoke all on function game.sync_session_points_trg() from public, anon, authenticated;

-- ------------------------------------------------------------
-- 4. set_session_customer: repair path uses the tier rule too
-- ------------------------------------------------------------
-- Body identical to game-points-migration.sql except the re-sync call.
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
             s.charged_minutes,
             game.session_point_rule(s.tier, s.points_rule, s.customer_id,
                                     s.status = 'closed' and s.void_reason is null))
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
-- 5. Editing points per hour: owner only, audited
-- ------------------------------------------------------------
create or replace function game.set_tier_points(p_tier text, p_points integer)
returns integer
language plpgsql
security definer
set search_path = game, public
as $$
declare
  v_old integer;
begin
  if not game.is_superadmin() then
    raise exception 'Only the owner can change points.' using errcode = '42501';
  end if;
  if p_points is null or p_points < 0 or p_points > 100000 then
    raise exception 'Points per hour must be between 0 and 100000.' using errcode = '22023';
  end if;

  select points_per_hour into v_old from game.pricing where tier = p_tier for update;
  if not found then
    raise exception 'Unknown tier.' using errcode = '23503';
  end if;
  if v_old = p_points then
    return p_points;
  end if;

  update game.pricing set points_per_hour = p_points where tier = p_tier;

  perform public.audit('game', 'points.rule_changed',
    format('%s points per hour set to %s. Was %s.', p_tier, p_points, v_old),
    'pricing', p_tier, p_tier,
    jsonb_build_object('before', v_old, 'after', p_points),
    auth.uid());

  return p_points;
end $$;

revoke all on function game.set_tier_points(text, integer) from public, anon;
grant execute on function game.set_tier_points(text, integer) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';

-- ── VERIFY (run by hand) ────────────────────────────────────────────────────
--   select tier, points_per_hour from game.pricing order by tier;
--     -> CINEMA 7, PS4 3, PS5 5, VIP 7
--   select app, is_active from public.point_rules where app = 'game';
--     -> must be true for anyone to earn
