-- ⚠ SUPERSEDED - DO NOT RUN. Kept only as the record of the original design.
--
-- This targeted a standalone Supabase project with everything in `public` and
-- `for all using (true)` RLS. The game shop now lives in the shared futsal
-- project under its own `game` schema, where "authenticated" also means every
-- futsal and billiards account - so those blanket policies would be a hole.
--
-- The live schema is supabase/game-schema-migration.sql. Its seed section
-- already contains the floor plan and catalogue that used to live in seed.sql.
--
-- MyaThida — initial schema (records + billing model)
-- Mirrors src/lib/types.ts. Timing/TV control are external (CozyLife).

create extension if not exists "pgcrypto";

-- staff maps to auth.users. Superadmins are created by hand in the Supabase
-- dashboard (email); normal admins are created in-app by a superadmin (phone).
create table if not exists staff (
  id uuid primary key references auth.users (id) on delete cascade,
  name text not null,
  phone text,
  email text,
  role text not null default 'admin' check (role in ('superadmin', 'admin')),
  active boolean not null default true,
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create table if not exists stations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  tier text not null check (tier in ('PS4', 'PS5', 'VIP')),
  status text not null default 'available' check (status in ('available', 'maintenance')),
  occupied boolean not null default false,
  sort_order int not null default 0
);

-- one active rate per tier
create table if not exists pricing (
  tier text primary key check (tier in ('PS4', 'PS5', 'VIP')),
  rate_per_hour numeric not null,
  min_minutes int not null default 30
);

create table if not exists products (
  id uuid primary key default gen_random_uuid(),
  name_en text not null,
  name_my text not null,
  category text not null check (category in ('snack', 'drink')),
  price numeric not null,
  stock int,
  active boolean not null default true
);

-- a completed, recorded session (immutable history row)
create table if not exists sessions (
  id uuid primary key default gen_random_uuid(),
  station_id uuid references stations (id),
  station_name text not null,
  tier text not null check (tier in ('PS4', 'PS5', 'VIP')),
  rate_per_hour numeric not null,
  minutes int not null check (minutes > 0),
  charged_minutes int not null,
  playtime_total numeric not null,
  snacks_total numeric not null default 0,
  total numeric not null,
  label text,
  created_by uuid references staff (id),
  created_at timestamptz not null default now()
);

create table if not exists order_lines (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references sessions (id) on delete cascade,
  product_id uuid references products (id),
  product_name text not null,
  qty int not null check (qty > 0),
  unit_price numeric not null,
  line_total numeric not null
);

create index if not exists idx_sessions_created on sessions (created_at desc);
create index if not exists idx_sessions_station on sessions (station_id);
create index if not exists idx_order_lines_session on order_lines (session_id);

-- RLS: any authenticated staff may read/write. Tighten later (e.g. restrict
-- pricing/stations/staff writes to role = 'superadmin' via policies).
alter table staff enable row level security;
alter table stations enable row level security;
alter table pricing enable row level security;
alter table products enable row level security;
alter table sessions enable row level security;
alter table order_lines enable row level security;

do $$
declare t text;
begin
  foreach t in array array['staff','stations','pricing','products','sessions','order_lines']
  loop
    execute format(
      'create policy %I on %I for all to authenticated using (true) with check (true);',
      t || '_authenticated', t
    );
  end loop;
end $$;
