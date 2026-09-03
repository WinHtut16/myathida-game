# MyaThida — Game Shop Management

Admin/staff console for a PS4/PS5 walk-in game shop. The app is a **cost
calculator + session-history recorder** with a **manual occupancy board**.
Bilingual (English + Burmese).

Timing and TV power are handled **outside** this app (the shop uses the CozyLife
smart-plug app to run each TV's timer and switch it on/off). So this system has
**no live countdown and no hardware control** — staff record a completed session
(TV, duration, snacks) and the app computes the total and saves it to history.

Originally built from the Claude Design handoff in `docs/design-handoff/`
(design spec: `docs/MyaThida_System_Design.md`, superseded in part — see its
top note). Current design conventions live in [DESIGN.md](DESIGN.md), shared
verbatim with the two sibling apps below.

**Design/UI work:** see [DESIGN.md](DESIGN.md) first — the pattern contract
shared byte-identical with `PointSystem_AkoATP` and `Billiards_MyaThida`
(button order, nav model, screen shapes, container widths, i18n rules).
Shared tokens live in `design/tokens.css`. After editing either, copy it to
the other two repos and run `node scripts/check-design-sync.mjs`.

## Multi-business admin portal

This app is not a standalone site. It's a Next.js multi-zone deployment
served from the **futsal app's origin** under `/admin/game`, which rewrites
to this deployment. `basePath: "/admin/game"` in `next.config.mjs` makes both
pages and `_next` assets live under that prefix — running this repo standalone
serves `/admin/game/floor`, not `/`. Same origin is the point: one session
cookie covers all three businesses (futsal, billiards, game) with no custom
domain. See `next.config.mjs` for the full rationale and gotchas
(trailing-slash redirects, Server Action CSRF origins).

## Stack

- **Next.js 16** (App Router) + **React 19** + **TypeScript**
- **Tailwind CSS** — design tokens in `tailwind.config.ts` + `design/tokens.css`
- **lucide-react** icons
- **Supabase** (Postgres + Auth) — fully wired via `src/lib/data/*` (reads)
  and `src/app/actions/*` (writes), all server-side only. No browser Supabase
  client — see the note in `src/lib/data/` about Myanmar mobile networks
  blocking `*.supabase.co` at the ISP level.

## Running it

```bash
npm install
npm run dev        # http://localhost:3000/admin/game/floor
npm run build
npm run typecheck
```

Requires Supabase env vars pointing at the shared futsal project (see
`PointSystem_AkoATP/CLAUDE.md` for the schema setup order). There is no
mock/demo data source and no role switcher — sign-in happens on the hub
(`/admin/login`); this app reads the resulting session.

## What it does

- **Floor** (`/floor`) — occupancy board of all stations. Toggle each TV
  Occupied/Free by hand, or hit **Record session**.
- **Record session** — pick the TV (auto-fills tier + rate), enter the
  duration, add snacks → live total → save. Recording frees the TV.
- **Reports** (`/reports`) — revenue/session history, charts, per-session
  receipts. Superadmin can correct a wrongly-recorded session.
- **Products** (`/products`) — snack/drink price list + stock ledger,
  bilingual. Superadmin edits; all staff can view.
- **Pricing** (`/pricing`, superadmin) — per-tier rate cards.
- **Settings** (`/settings`) — floor plan (station tier/maintenance,
  superadmin edits), staff roster (read-only — staff CRUD lives on the hub
  at `/admin/staff`), default reading language.
- **Account** (`/account`) — own display name + reading language; password
  change links out to the hub.
- **Export** (`/export`, superadmin) — full-shop `.xlsx` backup.

Sign-in is **not** implemented in this repo — `/login` is a vestigial static
page. Real authentication happens on the hub at `/admin/login`; this app
reads the resulting session via `getCurrentUser()`.

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

Two roles, resolved server-side via `is_superadmin()` RPC against the shared
`app_access` grants (not stored in this app):

- **Superadmin** — manages tier pricing, station config; superadmin-only nav
  items (`/pricing`, `/export`) are hidden from admins, not just disabled.
- **Admin** — records sessions, toggles occupancy, views (not edits) menu
  and pricing. Staff accounts are created on the hub, not here.

The UI principle throughout: role decides what to **show**, never what is
**allowed** — every write is re-checked server-side regardless of what the
client rendered.

## Project layout

```
src/
  app/                 routes (App Router; basePath /admin/game supplies the prefix)
    floor/             occupancy board
    reports/           session history + charts
    products/          snack/drink catalogue + stock
    pricing/           tier pricing (superadmin)
    settings/          stations + language
    account/           own profile
    export/            xlsx backup (superadmin)
    api/export/        xlsx generation endpoint
    login/             vestigial — real sign-in is on the hub
  components/
    layout/            AppShell, Sidebar, SidebarFooter, LanguageSwitch
    station/           StationTile, TierBadge, FloorBoard
    session/           RecordSessionModal
    reports/           StatTile, hand-rolled SVG charts, SessionTable
    catalogue/         ProductsView, PricingView, SettingsView, AccountView, ExportPanel
  lib/
    data/              server-side Supabase reads
    hooks/             useAutoRefresh polling (no Realtime — see zone notes)
    ui.ts              class-join helper + tier styling
    format.ts          MMK currency + date/time formatting
  actions/             server actions (writes)
  i18n/                en.ts / my.ts dictionaries + useT/getT
design/
  tokens.css           shared design tokens (see DESIGN.md)
supabase/
  migrations/          schema + RLS (applied to the shared futsal project)
docs/                  design spec + original handoff bundle (partially superseded)
```

## Out of scope

No timers, no TV on/off control, no smart-plug/bridge integration — the shop
runs those in CozyLife. This app only calculates costs and records history.
