-- Correct a paid session in place, without moving the money to another day.
--
-- WHY THIS EXISTS
-- Until now the only write to a closed session was game.void_session(), which
-- can set the charge to ZERO and nothing else. There was no way to say "this
-- was 19 minutes, not 90". The workaround was void + record_session, and that
-- workaround is WRONG across a day boundary: record_session does not list
-- created_at in its insert, so the replacement row takes `default now()`.
-- Correcting a Sep 17 session on Sep 18 moved 28,000 MMK off the 17th and onto
-- the 18th. Both daily reports then lied, which is the one screen the owner
-- actually reads.
--
-- So this corrects IN PLACE and never touches created_at. The objection to
-- in-place editing - that it erases the original number - is answered by
-- keeping the original in its own columns rather than by refusing to edit.
-- The history row can then show both: "was 4h / 28,000, corrected to 19 min".
--
-- IDEMPOTENT. Safe to re-run.

begin;

do $$
begin
  if to_regprocedure('game.bill_minutes(numeric,int,int,int,int)') is null then
    raise exception 'game-live-sessions-migration.sql has not been applied. Nothing was created.';
  end if;
  if to_regprocedure('public.audit(text,text,text,text,text,text,jsonb,uuid)') is null then
    raise exception 'audit-money-migration.sql has not been applied. Nothing was created.';
  end if;
end $$;

-- ── 1. Remember what was charged before ─────────────────────────────────────
-- Nullable on purpose: null means "never corrected", which is every row today
-- and most rows forever. A correction fills them once and never overwrites, so
-- a second correction still shows what the customer was ORIGINALLY charged
-- rather than what the previous correction happened to leave behind.
alter table game.sessions
  add column if not exists original_minutes         int,
  add column if not exists original_charged_minutes int,
  add column if not exists original_total           numeric,
  add column if not exists correction_reason        text,
  add column if not exists corrected_by             uuid references auth.users (id),
  add column if not exists corrected_at             timestamptz;

comment on column game.sessions.original_total is
  'What this session charged before a superadmin corrected it. Null = never corrected.';

-- ── 2. The correction itself ────────────────────────────────────────────────
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
  -- Superadmin only. A correction moves money after the customer has paid, so
  -- it is the owner's decision, not the counter's. Staff report, owner fixes.
  if not game.is_superadmin() then
    raise exception 'Only a superadmin can correct a session.' using errcode = '42501';
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

-- ── 3. Stop the checkout audit trigger firing on a correction ───────────────
-- It fires `after update of total`, and a correction updates total. Without
-- this guard every correction would also write a second, wrong audit row
-- claiming a session had just been recorded or closed.
drop trigger if exists audit_game_session_recorded on game.sessions;
create trigger audit_game_session_recorded
  after update of total on game.sessions
  for each row
  when (new.void_reason is null and old.void_reason is null
        and new.corrected_at is not distinct from old.corrected_at)
  execute function public.audit_game_session_recorded();

-- ── 4. Grants ───────────────────────────────────────────────────────────────
revoke all on function game.correct_session(uuid, int, text) from public, anon;
grant execute on function game.correct_session(uuid, int, text) to authenticated;

commit;

notify pgrst, 'reload schema';

-- VERIFY
--   select id, created_at, minutes, charged_minutes, total,
--          original_charged_minutes, original_total, corrected_by, corrected_at
--     from game.sessions where corrected_at is not null order by corrected_at desc;
--   -- the correction must NOT have moved the day:
--   select date_trunc('day', created_at at time zone 'Asia/Yangon') as taken_on,
--          count(*), sum(total)
--     from game.sessions where status='closed' group by 1 order by 1 desc limit 7;
