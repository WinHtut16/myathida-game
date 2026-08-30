# MyaThida — Game Shop Management

Admin/staff console for a PS4/PS5 walk-in game shop. The app is a **cost
calculator + session-history recorder** with a **manual occupancy board**.
Bilingual (English + Burmese).

Timing and TV power are handled **outside** this app (the shop uses the CozyLife
smart-plug app to run each TV's timer and switch it on/off). So this system has
**no live countdown and no hardware control** — staff record a completed session
(TV, duration, snacks) and the app computes the total and saves it to history.

Built from the Claude Design handoff in `docs/design-handoff/`. Design spec:
`docs/MyaThida_System_Design.md`.

## Stack

- **Next.js 14** (App Router) + **React 18** + **TypeScript**
- **Tailwind CSS** — design tokens in `tailwind.config.ts`
- **lucide-react** icons
- **Supabase** (Postgres + Auth) — schema in `supabase/`, not yet wired

## Running it

```bash
npm install
npm run dev        # http://localhost:3000
npm run build
npm run typecheck
```

Runs on an in-memory mock dataset (`src/lib/mock/seed.ts`) — no backend needed.
A demo **role switcher** (superadmin / admin) sits at the bottom of the sidebar.

## What it does

- **Floor** — occupancy board of all stations. Toggle each TV Occupied/Free by
  hand, or hit **Record session**.
- **Record session** — pick the TV (auto-fills tier + rate), enter the duration,
  add snacks → live total → save. Recording frees the TV.
- **History** — every recorded session, today's totals, top snacks, and a
  per-session receipt.
- **Snacks** — manage the snack/drink price list (bilingual).
- **Pricing** *(superadmin)* — per-tier rate cards.
- **Settings** — station config (tier, maintenance), **admin accounts**
  *(superadmin)*, default language.
- **Login** — email+password (superadmin) or phone+password (admin).

## Pricing

Charged **per minute, prorated** from the hourly rate, with a configurable
minimum (default 30 min):

| Tier | Rate | Stations |
|---|---|---|
| PS4 | 3,000 MMK/hr | TV 1–7 |
| PS5 | 5,000 MMK/hr | TV 8–9 |
| VIP (PS5) | 7,000 MMK/hr | VIP room |

`total = max(minutes, minMinutes) / 60 × ratePerHour + snacks`

## Roles

- **Superadmin** — created by hand in the Supabase dashboard (email + password).
  Manages tier pricing, station config, and admin accounts.
- **Admin** — created **in-app** by a superadmin (phone + password). Records
  sessions, toggles occupancy, manages snacks.

## Project layout

```
src/
  app/                 routes (App Router)
    page.tsx           Floor / occupancy board
    admin/reports      Session History
    admin/products     Snacks
    admin/pricing      Tier pricing (superadmin)
    admin/settings     Stations + Admins + language
    login              dual-mode sign-in
  components/
    layout/            Sidebar, AppShell, LanguageSwitch
    station/           StationTile, TierBadge
    session/           RecordSessionModal
  lib/
    types.ts           domain types (mirror the DB schema)
    pricing.ts         per-minute proration + totals
    format.ts          MMK currency + date/time formatting
    ui.ts              helpers + tier styling
    mock/seed.ts       demo dataset (7 PS4 + 2 PS5 + VIP)
    data/store.tsx     in-memory client store (React context) — the live source
    data/repository.ts data-access contract to implement against Supabase
    supabase/client.ts Supabase wiring stub
  i18n/                en.ts / my.ts dictionaries + useT hook
supabase/
  migrations/0001_init.sql   schema + RLS
  seed.sql                   optional demo seed
docs/                        design spec + original handoff bundle
```

## Going live on Supabase

1. Create a project; run `supabase/migrations/0001_init.sql` (optionally `seed.sql`).
2. `npm install @supabase/supabase-js`, fill `.env.local` from `.env.example`,
   set `NEXT_PUBLIC_DATA_SOURCE=supabase`.
3. Implement the `Repository` interface (`src/lib/data/repository.ts`) against
   Supabase and swap `StoreProvider` to hydrate from it.
4. Auth: **email+password for superadmins** (created in the dashboard),
   **phone+password for admins**. The "add admin" action needs Supabase's
   **service-role** key, so it must run server-side (a Next.js route handler /
   server action or a Supabase Edge Function) — never in the browser. Gate
   `/admin/pricing`, station config, and admin management to `role = superadmin`.

## Out of scope

No timers, no TV on/off control, no smart-plug/bridge integration — the shop
runs those in CozyLife. This app only calculates costs and records history.
