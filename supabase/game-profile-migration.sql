-- ============================================================
-- game-profile-migration.sql
--
-- Two fixes to the game schema. Run in the FUTSAL Supabase project
-- (mmyjtvlnuizpwktpkuij), after game-schema-migration.sql.
--
-- SAFE TO RE-RUN? Yes - functions only, create or replace.
-- ============================================================

do $$
begin
  if to_regclass('game.staff') is null then
    raise exception 'game schema not found. Run game-schema-migration.sql first.';
  end if;
end $$;

-- ── 1. A global superadmin was being displayed as "admin" ───────────────────
-- staff_directory() read rank from app_access alone:
--     coalesce(a.role, 'admin')
-- A GLOBAL superadmin (public.profiles.role = 'superadmin') has no app_access
-- row for any single business, because they outrank the per-business grants
-- entirely - so the left join produced NULL and the coalesce called the owner
-- an admin. Cosmetic in one sense: every actual permission check goes through
-- public.app_role(), which has always handled the override correctly, so
-- nothing was wrongly allowed or denied. But a console that tells the owner he
-- is an ordinary admin undermines trust in everything else it displays, and it
-- would have made a genuine permissions problem impossible to read.
--
-- This mirrors what public.app_role() does, so the directory and the
-- enforcement now answer the same question the same way.
create or replace function game.staff_directory()
returns table (
  id uuid, name text, phone text, email text,
  role text, active boolean, created_by uuid, created_at timestamptz
)
language sql stable security definer
set search_path = game, public as $$
  select s.id, s.name, s.phone, s.email,
         coalesce(
           a.role,
           case when p.role = 'superadmin' then 'superadmin' end,
           'admin'
         ) as role,
         s.active, s.created_by, s.created_at
    from game.staff s
    left join public.app_access a
      on a.user_id = s.id and a.app = 'game'
    left join public.profiles p
      on p.id = s.id
   where game.is_active_staff()
   order by s.created_at;
$$;

-- ── 2. Let a person edit their own name and language ────────────────────────
-- game.staff carries a superadmin-only write policy, which is right for adding
-- and removing people but means a member of staff cannot correct the spelling
-- of their own name or pick their reading language. SECURITY DEFINER with a
-- hard-coded auth.uid() target: this function can only ever touch the caller's
-- own row, so it cannot become a way to rename somebody else.
create or replace function game.update_own_profile(
  p_name text,
  p_lang text default null
)
returns void language plpgsql security definer
set search_path = game, public as $$
declare
  v_name text := nullif(btrim(coalesce(p_name, '')), '');
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  if v_name is null then
    raise exception 'A name cannot be empty.' using errcode = '22023';
  end if;
  if p_lang is not null and p_lang not in ('en','my') then
    raise exception 'Unknown language.' using errcode = '22023';
  end if;

  update game.staff
     set name = v_name,
         preferred_lang = coalesce(p_lang, preferred_lang)
   -- auth.uid(), never a parameter: the caller can only edit themselves.
   where id = auth.uid();
end $$;

revoke all on function game.update_own_profile(text, text) from public;
grant execute on function game.update_own_profile(text, text) to authenticated;
grant execute on function game.staff_directory() to authenticated;

-- Sanity check, signed in as the owner:
--   select role from game.staff_directory() where id = auth.uid();
--   -- must now say superadmin, not admin
