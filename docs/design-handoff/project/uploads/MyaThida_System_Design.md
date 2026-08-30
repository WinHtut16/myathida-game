# MyaThida — Game Shop Management System

**Design specification for Claude Design → Claude Code handoff**
Version 1.0 · Prepared for: MyaThida (PS4/PS5 game shop)
Admin-only web application · Bilingual (English + Burmese)

---

## 1. Overview

MyaThida is a walk-in console gaming shop. Customers arrive (often in groups), rent a TV station with a PS4 or PS5, play on a timed session (1 hour minimum, extendable in 15-minute steps), and can order snacks and drinks during play. Staff track all active stations on one screen, add orders, pause/extend sessions, and settle a single bill when the group leaves.

This system is **admin/staff-facing only** — there is no customer-facing app. It is the third system built for this client, following the same stack and deployment pattern as the existing futsal and billiard systems (Node.js, Vercel, Supabase).

**Scope of this version:** software only. Physical TV auto-shutoff (hardware control) is explicitly **out of scope** and deferred to a later, separately-quoted phase. Sessions end manually — staff see the expired timer and close the station.

### Key decisions (locked)

| Area | Decision | Rationale |
|---|---|---|
| Payment | **Postpay** by default, optional **prepay deposit** | Matches SEA walk-in culture and the billiard system; deposit hedges walkout risk on large/long groups |
| Billing | **One group tab**, splittable per station | Groups usually pay together; splitting stays available on request |
| Pause | **Allowed**, admin-only, audited, paused time not billed | Fair to customers (glitches, breaks); audit log protects the business |
| Receipt | **Screen-only** | No thermal printer yet; printing deferred |
| Station count | **Dynamic / configurable** | Client hasn't fixed TV count or PS4/PS5 split |
| Timer | **Server-authoritative** (DB-driven), never in-memory | Survives refresh, crash, serverless cold starts |

---

## 2. Tech stack

- **Framework:** Next.js (App Router) + React + TypeScript
- **Backend:** Next.js server actions / route handlers (Node runtime)
- **Database:** Supabase Postgres
- **Auth:** Supabase Auth (email/password for staff accounts)
- **Realtime:** Supabase Realtime (live station grid updates across devices)
- **Security:** Row Level Security (RLS) — only authenticated staff can read/write
- **i18n:** `next-intl` (or `i18next`) with `en` and `my` locale JSON files
- **Fonts:** Noto Sans Myanmar / Pyidaungsu for Burmese. Enforce Unicode; do **not** support Zawgyi encoding
- **Styling:** (left to Claude Design — Tailwind recommended to match component-driven handoff)
- **Deployment:** Vercel (its own project, its own Supabase instance — same isolation as futsal/billiard)

### Why server-authoritative timers

Vercel serverless functions cannot hold long-running countdowns in memory. Instead, each session stores `start_time` and `end_time` in the database. The client computes the countdown as `end_time − now()` and re-derives it on every render/refresh. Pauses are tracked as interval rows and subtracted from billable time. Nothing depends on a process staying alive.

---

## 3. Data model (Supabase / Postgres)

### `staff`
Maps to Supabase auth users.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | = auth.users.id |
| name | text | |
| role | text | `admin` \| `staff` |
| active | bool | |
| created_at | timestamptz | |

### `stations`
The physical TV + console stands. Count and type are configurable.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| name | text | e.g. "TV 1" |
| console_type | text | `PS4` \| `PS5` |
| status | text | `idle` \| `active` \| `paused` \| `maintenance` |
| sort_order | int | grid ordering |
| active | bool | soft-disable a broken stand |

### `pricing`
Editable rates so the client can change prices without redeploy.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| console_type | text | `PS4` \| `PS5` (separate rates supported) |
| rate_per_hour | numeric | base hourly rate |
| min_minutes | int | default 60 |
| ext_step_minutes | int | default 15 |
| ext_rate_per_step | numeric | price per extension step |
| active | bool | current price row |

### `tabs`
A group's combined bill. Links one or more sessions + orders.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| label | text | optional, e.g. customer name / group note |
| deposit | numeric | prepaid deposit, default 0 |
| status | text | `open` \| `closed` |
| grand_total | numeric | computed at close |
| payment_method | text | `cash` \| `mobile` \| other |
| opened_by | uuid (FK staff) | |
| closed_at | timestamptz | |
| created_at | timestamptz | |

### `sessions`
One station's timed play. Belongs to a tab (nullable for a lone walk-in that still gets an implicit tab).

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| tab_id | uuid (FK tabs) | groups multiple stations |
| station_id | uuid (FK stations) | |
| console_type | text | snapshot at start (price integrity) |
| rate_per_hour | numeric | snapshot at start |
| start_time | timestamptz | |
| end_time | timestamptz | current scheduled end (moves on extend/pause) |
| base_minutes | int | default 60 |
| status | text | `active` \| `paused` \| `ended` |
| billable_minutes | int | computed at end |
| playtime_amount | numeric | computed at end |
| created_by | uuid (FK staff) | |

### `session_extensions`
Every extension is a row (audit + revenue trail).

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid (FK) | |
| added_minutes | int | 15, 30, 60… |
| added_amount | numeric | |
| created_by | uuid (FK staff) | |
| created_at | timestamptz | |

### `session_pauses`
Pause intervals. Open pause = `resumed_at` null.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| session_id | uuid (FK) | |
| paused_at | timestamptz | |
| resumed_at | timestamptz | null while paused |
| reason | text | required |
| by | uuid (FK staff) | admin-only |

### `products`
Snacks and drinks, bilingual names.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| name_en | text | |
| name_my | text | |
| category | text | `snack` \| `drink` |
| price | numeric | |
| stock | int | nullable if not tracking |
| active | bool | |

### `orders`
Food/drink line items. Attach to a tab (default) so any station's order rolls into the group bill.

| column | type | notes |
|---|---|---|
| id | uuid (PK) | |
| tab_id | uuid (FK tabs) | |
| session_id | uuid (FK, nullable) | which station ordered (for split bills) |
| product_id | uuid (FK products) | |
| product_name | text | snapshot |
| qty | int | |
| unit_price | numeric | snapshot |
| line_total | numeric | |
| created_by | uuid (FK staff) | |
| created_at | timestamptz | |

### Billing math

```
session.billable_minutes = (end_time − start_time) − Σ pause_duration
session.playtime_amount  = ceil(billable_minutes based on rate, min 60m + ext steps)

tab.grand_total = Σ sessions.playtime_amount (where tab_id)
                + Σ orders.line_total       (where tab_id)
                − tab.deposit
```

Split bill = same math filtered per `session_id` instead of per `tab_id` (orders with a `session_id` go to that station; tab-level orders are divided or assigned by staff at split time).

---

## 4. Session state machine

```
        ┌──────────┐   start session    ┌──────────┐
        │  idle    │ ─────────────────▶ │  active  │
        └──────────┘                    └────┬─────┘
             ▲                               │
             │                     pause (admin, +reason)
             │                               ▼
             │                          ┌──────────┐
             │            resume        │  paused  │
             │        ◀──────────────── └────┬─────┘
             │                               │
        end / close (manual)                 │ (can also end from paused)
             │                               │
             └──────────────┬────────────────┘
                            ▼
                       ┌──────────┐
                       │  ended   │  → station returns to idle
                       └──────────┘
```

- **extend** is a self-transition on `active` (or `paused`): pushes `end_time` forward, writes an extension row.
- **pause**: status → `paused`, opens a `session_pauses` row, countdown display freezes.
- **resume**: closes the pause row, `end_time` shifts forward by the paused duration so remaining time is preserved.
- **end**: computes `billable_minutes` and `playtime_amount`, sets station back to `idle`. Tab stays `open` until the group settles and checks out.
- Expired timer does **not** auto-end — station card flags red; staff ends manually.

---

## 5. Pages & components

All pages behind auth. Role gates noted where relevant.

### 5.1 Login
- Supabase email/password. Redirect to Floor Dashboard on success.
- Components: `LoginForm`, language switch (EN/MY) visible pre-auth.

### 5.2 Floor Dashboard `/` (primary screen)
The main working screen — a live grid of all stations.
- **Components:** `StationGrid`, `StationCard`, `TabSummaryBar`, `LanguageSwitch`, `NewSessionButton`.
- **StationCard** shows: station name, console badge (PS4/PS5), live countdown, status color, group/tab label, quick actions (extend, add order, end).
- **States (color-coded):**
  - `idle` — neutral/empty, "Start" affordance
  - `active` — green, counting down
  - `active <10 min` — amber warning
  - `expired` — red, needs staff action
  - `paused` — blue/grey, frozen time + reason
  - `maintenance` — disabled/striped
- **Realtime:** subscribes to `stations` + `sessions` so multiple staff devices stay in sync.

### 5.3 Start Session (modal or drawer)
- Pick **console type** → shows only free stations of that type.
- **Multi-select stations** (group can take several at once → all attach to one new tab).
- Optional: tab label, prepay deposit amount.
- Base = 60 min. Creates tab + N sessions in one action.
- **Components:** `StartSessionModal`, `StationPicker`, `DepositInput`.

### 5.4 Station Detail (drawer)
Opened from a card.
- Live timer, console/rate info.
- **Extend** buttons: +15 / +30 / +1h (steps from pricing).
- **Pause / Resume** (admin-only; pause requires reason).
- **Add order** (embeds Order Panel).
- **End session** (with confirm; shows this station's running subtotal).
- **Components:** `StationDetailDrawer`, `TimerDisplay`, `ExtendControls`, `PauseControl`, `OrderPanel`, `EndSessionConfirm`.

### 5.5 Order Panel (reusable)
- Product grid filtered by category (snack/drink), search, qty steppers.
- Running subtotal. Adds `orders` rows to the tab (optionally tagged to the station).
- Bilingual product names from `name_en` / `name_my` by active locale.
- **Components:** `OrderPanel`, `ProductGrid`, `ProductTile`, `CartList`.

### 5.6 Checkout / Bill `/tab/[id]`
- Full breakdown: each station's playtime + all food/drink, minus deposit → grand total.
- **Split bill** toggle → per-station breakdown.
- Payment method select. Mark paid → closes tab, frees any still-open stations.
- Screen-only (no printing this version); layout should be print-friendly for later.
- **Components:** `BillView`, `PlaytimeBreakdown`, `FoodBreakdown`, `SplitToggle`, `PaymentSelect`, `CloseTabButton`.

### 5.7 Products Admin `/admin/products` (admin)
- CRUD snacks/drinks: EN + MY names, category, price, stock, active toggle.
- **Components:** `ProductTable`, `ProductForm`.

### 5.8 Pricing Admin `/admin/pricing` (admin)
- Edit per-console rate, min minutes, extension step + rate.
- New price = new active row (history preserved; sessions snapshot their rate).
- **Components:** `PricingForm`.

### 5.9 Reports `/admin/reports` (admin)
- Daily/weekly revenue (playtime vs food split), station utilization, top products, deposits taken.
- **Components:** `RevenueChart`, `UtilizationTable`, `TopProductsList`, `DateRangePicker`.

### 5.10 Settings `/admin/settings` (admin)
- Station config: add/edit/remove stations, set console type, sort order, maintenance flag (**this is how the undecided TV count is handled**).
- Staff management: create staff, set role, deactivate.
- Default language.
- **Components:** `StationConfigTable`, `StaffTable`, `LanguageDefault`.

---

## 6. Internationalization (EN / MY)

- Library: `next-intl`. Two message files: `messages/en.json`, `messages/my.json`.
- **UI strings** live in locale files (not the DB).
- **Data strings** that are bilingual (product names) live in DB columns `name_en` / `name_my`; the UI picks by active locale.
- Language switch persists per staff (localStorage or `staff` default) and is available pre-auth.
- Myanmar text must render in Unicode (Noto Sans Myanmar / Pyidaungsu). Numbers/currency: keep Arabic numerals; format currency consistently (Kyat).

### Suggested key structure

```json
{
  "nav": { "dashboard": "", "products": "", "pricing": "", "reports": "", "settings": "" },
  "station": { "idle": "", "active": "", "paused": "", "expired": "", "maintenance": "", "ps4": "", "ps5": "" },
  "session": { "start": "", "extend": "", "pause": "", "resume": "", "end": "", "reason": "", "deposit": "" },
  "order": { "snacks": "", "drinks": "", "addToTab": "", "qty": "", "subtotal": "" },
  "bill": { "playtime": "", "food": "", "deposit": "", "grandTotal": "", "split": "", "paymentMethod": "", "close": "" },
  "common": { "save": "", "cancel": "", "confirm": "", "search": "", "language": "" }
}
```

---

## 7. Build phases

| Phase | Scope | Ships independently |
|---|---|---|
| **1 — Core** | Auth, station config, start/extend/pause/end, live server-authoritative timers, single-tab manual bill | ✅ MVP, usable day one |
| **2 — Orders & bills** | Products admin, order panel, full tab + split billing, deposits, reports | ✅ |
| **3 — i18n polish** | Full EN/MY coverage, font QA, currency/format review | ✅ |
| **4 — Hardware (deferred, separate quote)** | Local controller + smart-plug/IR TV auto-shutoff at expiry, tied to Supabase Realtime | Separate deliverable, on-site |

Phases 1–3 are pure web on the existing Vercel + Supabase pattern. Phase 4 is hardware + on-site setup and is **not part of this build** — quote separately if the client proceeds.

---

## 8. Handoff notes for Claude Design

- **Primary surface is the Floor Dashboard** — design the station grid first; it's where staff live all day. Optimize for glanceability: status color, big countdown, one-tap extend/end.
- Design for **tablet/desktop landscape** (counter device), touch-friendly targets.
- Cover all six **station card states** (idle, active, warning, expired, paused, maintenance).
- Order panel and station detail are **drawers/modals** over the dashboard, not separate full pages, so staff never lose sight of the floor.
- Provide **EN and MY** versions of every screen; Burmese text runs longer — leave layout slack.
- Print-friendly bill layout (even though printing is deferred).

---

*End of specification.*
