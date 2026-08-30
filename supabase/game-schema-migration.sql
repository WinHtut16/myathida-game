-- ============================================================
-- game-schema-migration.sql
--
-- Creates the game shop's `game` schema inside the FUTSAL Supabase project
-- (mmyjtvlnuizpwktpkuij), alongside `public` (shared identity) and
-- `billiards`. Run it in that project's SQL Editor AFTER
-- app-access-migration.sql.
--
-- Why here and not its own project: the free tier allows two active projects
-- and both slots were already spoken for. Sharing this project also means all
-- three businesses share one auth.users, which is the whole reason one login
-- covers them - and a project with real daily futsal traffic can never
-- silently pause on the client mid-shift the way an idle free project does.
--
-- This supersedes supabase/migrations/0001_init.sql, which targeted `public`
-- in a standalone project and gave every authenticated user full read/write on
-- every table. That file is kept only as the record of the original design.
--
-- SAFE TO RE-RUN? No. It creates tables and seeds them. To start over:
--   drop schema game cascade;  -- destroys all game shop data
-- ============================================================

-- ── Refuse to run in the wrong project ──────────────────────────────────────
-- Checked before anything is created, so a wrong-project run changes nothing.
do $$
begin
  if to_regclass('public.app_access') is null
     or to_regprocedure('public.has_app_access(text)') is null
     or to_regprocedure('public.app_role(text)') is null then
    raise exception
      'Wrong project. This must run in the futsal Supabase project, where app-access-migration.sql has already been applied. Nothing was created.';
  end if;

  if to_regclass('game.sessions') is not null then
    raise exception
      'The game schema already exists here. This migration is not re-runnable - to start over, run: drop schema game cascade;';
  end if;
end $$;

create extension if not exists "pgcrypto";
create schema if not exists game;

-- PostgREST needs to see the schema. This alone is NOT enough: also add
-- `game` to Settings > API > Exposed schemas in the dashboard AND PRESS SAVE,
-- or every db:{schema:'game'} call comes back as a 404 that looks exactly
-- like a permissions problem. That unsaved-toggle cost an afternoon on
-- billiards; do not repeat it.
grant usage on schema game to anon, authenticated, service_role;
alter default privileges in schema game
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema game
  grant all on functions to anon, authenticated, service_role;
alter default privileges in schema game
  grant all on sequences to anon, authenticated, service_role;

-- Unqualified CREATEs below land in the first schema on this path.
set search_path = game, public;

-- ============================================================
-- Tables
-- ============================================================

-- Local staff directory. Rank is NOT stored here - it comes from
-- public.app_access via game.my_role(). This table exists because
-- sessions.created_by needs a stable FK target and a display name, and
-- because `active` is a local soft-delete that works even if a stale grant
-- lingers in app_access.
--
-- CONSEQUENCE, same as billiards: granting someone 'game' access in
-- app_access is necessary but not sufficient to let them record a session -
-- they also need a row here, or the created_by foreign key rejects the
-- insert. The staff screen must create both together.
create table staff (
  id          uuid primary key references auth.users (id) on delete cascade,
  name        text not null,
  phone       text,
  email       text,
  preferred_lang text not null default 'en' check (preferred_lang in ('en','my')),
  active      boolean not null default true,
  created_by  uuid references staff (id),
  created_at  timestamptz not null default now()
);

create table stations (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  tier       text not null check (tier in ('PS4','PS5','VIP')),
  status     text not null default 'available' check (status in ('available','maintenance')),
  occupied   boolean not null default false,
  sort_order int not null default 0
);

create table pricing (
  tier          text primary key check (tier in ('PS4','PS5','VIP')),
  rate_per_hour numeric not null check (rate_per_hour >= 0),
  min_minutes   int not null default 30 check (min_minutes >= 0)
);

create table products (
  id       uuid primary key default gen_random_uuid(),
  name_en  text not null,
  name_my  text not null,
  category text not null check (category in ('snack','drink')),
  price    numeric not null check (price >= 0),
  stock    int,
  active   boolean not null default true
);

-- A completed, recorded session. Immutable history: no UPDATE or DELETE policy
-- exists for it below, deliberately. Corrections are a new row, not an edit.
create table sessions (
  id              uuid primary key default gen_random_uuid(),
  station_id      uuid references stations (id),
  station_name    text not null,          -- snapshot; station may be renamed
  tier            text not null check (tier in ('PS4','PS5','VIP')),
  rate_per_hour   numeric not null,       -- snapshot
  minutes         int not null check (minutes > 0),
  charged_minutes int not null,
  playtime_total  numeric not null,
  snacks_total    numeric not null default 0,
  total           numeric not null,
  label           text,
  created_by      uuid not null references staff (id),
  created_at      timestamptz not null default now()
);

create table order_lines (
  id           uuid primary key default gen_random_uuid(),
  session_id   uuid not null references sessions (id) on delete cascade,
  product_id   uuid references products (id),
  product_name text not null,             -- snapshot
  qty          int not null check (qty > 0),
  unit_price   numeric not null,          -- snapshot
  line_total   numeric not null
);

create index idx_sessions_created     on sessions (created_at desc);
create index idx_sessions_station     on sessions (station_id);
create index idx_order_lines_session  on order_lines (session_id);
create index idx_stations_sort        on stations (sort_order);

-- ============================================================
-- Authorization helpers
--
-- Both are bound to the SHARED grants in public.app_access, so one login and
-- one grants table cover futsal, billiards and the game shop.
--
-- EVERY helper here returns NOT NULL, and that is load-bearing rather than
-- defensive tidying. public.app_role() returns NULL for someone with no
-- access to this business, so `app_role(...) = 'superadmin'` evaluates to NULL,
-- not FALSE. A plpgsql guard shaped like
--
--     if not is_superadmin() then raise exception '...'; end if;
--
-- then sees `not NULL` = NULL, the IF is not true, the raise never fires, and
-- the superadmin-only operation proceeds. That exact hole was demonstrated
-- live on billiards - an account with no grant at all zeroed a closed
-- session's takings - and coalesce is what closes it. Any helper added here
-- later must be NOT NULL too.
-- ============================================================

-- Can this person use the game shop at all?
-- The shared grant is the gate; the local soft-delete still locks out a
-- removed staff member even if a stale grant lingers.
create or replace function game.is_active_staff()
returns boolean language sql stable security definer
set search_path = game, public as $$
  select coalesce(public.has_app_access('game'), false)
     and not exists (
       select 1 from game.staff where id = auth.uid() and active = false
     );
$$;

-- Rank within the game shop specifically. A global superadmin passes; so does
-- someone granted 'superadmin' for 'game' alone - that is the point of the
-- per-business model, the shop manager can run the shop without inheriting the
-- power to purge futsal bookings.
create or replace function game.is_superadmin()
returns boolean language sql stable security definer
set search_path = game, public as $$
  select coalesce(public.app_role('game') = 'superadmin', false)
     and not exists (
       select 1 from game.staff where id = auth.uid() and active = false
     );
$$;

-- The staff screen needs name + rank together, but rank lives in
-- public.app_access, which a game admin cannot read directly under RLS.
-- SECURITY DEFINER joins the two; the guard on the first line is what keeps
-- that from being a hole.
create or replace function game.staff_directory()
returns table (
  id uuid, name text, phone text, email text,
  role text, active boolean, created_by uuid, created_at timestamptz
)
language sql stable security definer
set search_path = game, public as $$
  select s.id, s.name, s.phone, s.email,
         coalesce(a.role, 'admin') as role,
         s.active, s.created_by, s.created_at
    from game.staff s
    left join public.app_access a
      on a.user_id = s.id and a.app = 'game'
   where game.is_active_staff()
   order by s.created_at;
$$;

-- ============================================================
-- record_session - the one write that matters
--
-- Money is computed HERE, from the pricing and product rows in the database,
-- never from numbers the client sends. The client sends only what it actually
-- knows: which station, how many minutes, which products and how many of each.
-- Everything else is looked up and derived server-side, so a tampered request
-- cannot book a 90-minute VIP session as 300 MMK.
--
-- Session row, order lines and stock decrements all happen in one transaction:
-- a failure part-way cannot leave takings recorded with stock un-deducted, or
-- the reverse.
-- ============================================================
create or replace function game.record_session(
  p_station_id uuid,
  p_minutes    int,
  p_items      jsonb default '[]'::jsonb,   -- [{"productId":"uuid","qty":2}, ...]
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

  -- charge = max(minutes, min_minutes) / 60 * rate, mirroring
  -- src/lib/pricing.ts. If that rule ever changes, change it in both places
  -- and remember this one is the one that decides what the customer pays.
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

    -- stock null means "not tracked" (e.g. tap water); only enforce when it is.
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
    end if;
  end loop;

  update game.sessions
     set snacks_total = v_snacks,
         total        = v_playtime + v_snacks
   where id = v_session;

  -- Recording a session means the customer has left.
  update game.stations set occupied = false where id = v_station.id;

  return v_session;
end $$;

create or replace function game.set_occupied(p_station_id uuid, p_occupied boolean)
returns void language plpgsql security definer
set search_path = game, public as $$
begin
  if not game.is_active_staff() then
    raise exception 'Not authorised.' using errcode = '42501';
  end if;
  update game.stations set occupied = p_occupied where id = p_station_id;
  if not found then
    raise exception 'Unknown station.' using errcode = '23503';
  end if;
end $$;

-- ============================================================
-- Row level security
--
-- The original 0001_init.sql gave every authenticated user `for all using
-- (true)` on every table. On a standalone project that was merely loose; on
-- this shared project it would be a hole, because "authenticated" now includes
-- every futsal and billiards account. These policies replace it.
--
-- Note what has NO write policy: sessions and order_lines. Money only enters
-- through game.record_session(), which is SECURITY DEFINER and so bypasses RLS
-- after running its own check. There is deliberately no UPDATE or DELETE
-- policy on sessions - history is immutable, and a correction is a new row.
-- ============================================================

alter table staff       enable row level security;
alter table stations    enable row level security;
alter table pricing     enable row level security;
alter table products    enable row level security;
alter table sessions    enable row level security;
alter table order_lines enable row level security;

-- staff: everyone sees themselves; superadmins see and manage everyone.
create policy staff_select on staff for select
  using (id = auth.uid() or game.is_superadmin());
create policy staff_write_superadmin on staff for all
  using (game.is_superadmin()) with check (game.is_superadmin());

-- stations: all staff read; only superadmins change the floor plan.
-- Regular staff flip `occupied` through game.set_occupied() instead.
create policy stations_select on stations for select
  using (game.is_active_staff());
create policy stations_write_superadmin on stations for all
  using (game.is_superadmin()) with check (game.is_superadmin());

-- pricing: all staff read (the floor board shows rates); superadmins set them.
create policy pricing_select on pricing for select
  using (game.is_active_staff());
create policy pricing_write_superadmin on pricing for all
  using (game.is_superadmin()) with check (game.is_superadmin());

-- products: all staff read; superadmins manage the catalogue. Stock decrements
-- during a sale happen inside record_session(), not through this policy.
create policy products_select on products for select
  using (game.is_active_staff());
create policy products_write_superadmin on products for all
  using (game.is_superadmin()) with check (game.is_superadmin());

-- history: readable by all staff, writable by nobody directly.
create policy sessions_select on sessions for select
  using (game.is_active_staff());
create policy order_lines_select on order_lines for select
  using (game.is_active_staff());

revoke all on function game.record_session(uuid, int, jsonb, text) from public;
revoke all on function game.set_occupied(uuid, boolean)            from public;
grant execute on function game.record_session(uuid, int, jsonb, text) to authenticated;
grant execute on function game.set_occupied(uuid, boolean)            to authenticated;
grant execute on function game.staff_directory()                      to authenticated;
grant execute on function game.is_active_staff()                      to authenticated;
grant execute on function game.is_superadmin()                        to authenticated;

-- ============================================================
-- Seed: the real floor plan and opening catalogue.
--
-- Carried over from src/lib/mock/seed.ts, minus the fake staff and the fake
-- session history - those were demo scaffolding and must not reach a schema
-- that records real takings. Prices are the ones the client quoted; change
-- them in the Pricing screen, not here.
-- ============================================================

insert into pricing (tier, rate_per_hour, min_minutes) values
  ('PS4', 3000, 30),
  ('PS5', 5000, 30),
  ('VIP', 7000, 30);

insert into stations (name, tier, status, occupied, sort_order) values
  ('TV 1', 'PS4', 'available',   false, 1),
  ('TV 2', 'PS4', 'available',   false, 2),
  ('TV 3', 'PS4', 'available',   false, 3),
  ('TV 4', 'PS4', 'available',   false, 4),
  ('TV 5', 'PS4', 'available',   false, 5),
  ('TV 6', 'PS4', 'available',   false, 6),
  ('TV 7', 'PS4', 'available',   false, 7),
  ('TV 8', 'PS5', 'available',   false, 8),
  ('TV 9', 'PS5', 'available',   false, 9),
  ('VIP',  'VIP', 'available',   false, 10);

insert into products (name_en, name_my, category, price, stock, active) values
  ('Coca-Cola',       'ကိုကာကိုလာ',      'drink', 1000, 48, true),
  ('Potato Chips',    'အာလူးကြော်',      'snack', 1000, 22, true),
  ('Energy Drink',    'စွမ်းအင်အချိုရည်', 'drink', 2000, 12, true),
  ('Instant Noodles', 'ခေါက်ဆွဲ',        'snack', 1500, 10, true),
  ('Chocolate Bar',   'ချောကလက်',        'snack', 1200, 15, true),
  ('Peanuts',         'မြေပဲ',           'snack',  800, 30, true),
  ('Water',           'သောက်ရေ',         'drink',  500, 60, true);

-- ============================================================
-- What still has to happen by hand after this runs
--
--   1. Settings > API > Exposed schemas: add `game`. PRESS SAVE.
--   2. For each person who should use the shop, BOTH of:
--        insert into public.app_access (user_id, app, role)
--          values ('<auth.users id>', 'game', 'admin');   -- or 'superadmin'
--        insert into game.staff (id, name, phone)
--          values ('<same id>', 'Their Name', '+959...');
--      One without the other is the failure mode described above the staff
--      table: access granted, but recording a session fails on the FK.
--   3. Sanity check, signed in as that person:
--        select game.is_active_staff(), game.is_superadmin();
--      Both should be boolean, never null.
-- ============================================================
