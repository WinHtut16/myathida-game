# MyaThida Admin Suite — Design Contract

This file is **byte-identical** across all three repos:

- `PointSystem_AkoATP/DESIGN.md` (hub, `/admin/*`)
- `Billiards_MyaThida/DESIGN.md` (zone, `/admin/billiards/*`)
- `MyaThida_Game/DESIGN.md` (zone, `/admin/game/*`)

It holds the pattern contracts that `design/tokens.css` can't encode — button
order, screen shapes, empty-state recipes. Edit one, copy to the other two,
then run `node scripts/check-design-sync.mjs` in each repo.

Tokens live in `design/tokens.css`, mapped into each app's own Tailwind setup
(v3 apps via `tailwind.config.ts`, the v4 app via `@theme inline`). This file
is the rendered-result contract on top of those tokens: what a screen looks
like, not what variable it reads.

**Non-goal:** business logic, data access, auth, RLS, billing math. Every
rule below is presentational. See each repo's own `CLAUDE.md`/`AGENTS.md`
for the zone-specific landmines (cross-zone links must stay plain `<a>`, no
browser Supabase client in zones, no second PWA manifest, dynamic route
params go through `cleanRouteParam`) — those are not repeated here.

---

## Devices

Phone is primary. Design and test at 390px first, then 768px, then 1440px.
Minimum touch target `--tap-min` (44px) on anything tappable on mobile.

## Nav

- **Desktop (≥768px):** fixed sidebar, `--sidebar-w` (248px) expanded /
  `--sidebar-w-collapsed` (68px) collapsed. Grouped nav items with uppercase
  group labels (`--text-2xs`, `--tracking-caps`). Active item = tinted
  background (`--color-primary-soft`) + 3px left rail in `--color-primary`.
- **Mobile (<768px):** fixed bottom nav, `--bottomnav-h` + safe-area inset.
  Max 5 tabs: 4 primary destinations + a **More** tab. More opens a bottom
  sheet holding everything else (settings, staff, export, audit, account,
  business switcher, language toggle).
- No hamburger drawer. No breadcrumbs — hierarchies in this suite are one
  level deep; use a back-link (`← Back` text link, not a chevron button) at
  the top of a detail/form page instead.
- **App switcher:** renders only when the signed-in user holds 2+ business
  grants. Lives in the sidebar footer on desktop, in the More sheet on
  mobile. Always a plain `<a href="/admin/apps">` — never `next/link` (zone
  basePath doubling).

## Page shell

- Topbar height `--topbar-h` (56px): page title left (`--text-lg` mobile /
  `--text-xl` desktop), primary page action right if one exists.
- Container widths — pick one, do not invent a fourth:
  - `--w-form` (640px) — single-column forms: settings, account, create/edit.
  - `--w-list` (960px) — list + detail screens.
  - `--w-dashboard` (1200px) — dashboards, reports, floor/table boards.

## Buttons

**Variants:** `primary` · `secondary` · `ghost` · `danger`. One component,
same variant names, in all three apps. Never restyle a button ad hoc.

**Order — mobile vs desktop, same component handles both:**
- Mobile (<768px): stacked, full width. **Primary on top**, secondary/cancel
  below as `ghost`.
- Desktop (≥768px): right-aligned row. **Cancel then Primary**, primary
  rightmost.
- Destructive actions never sit adjacent to a primary action. They live in a
  labelled **Danger zone** block, rendered `danger` variant, on its own.

**Labels:** verb + object. "Save changes", not "OK". "Delete admin", not
"Yes". Every button says what happens when pressed.

## Destructive confirmation — three tiers, pick the right one

1. **ConfirmDialog** — reversible action or a single-row delete. Title +
   one-sentence consequence + Cancel/Confirm.
2. **TypeToConfirmDialog** — irreversible bulk action. Adds a text input the
   user must match to a literal confirm word (keep the word in English,
   e.g. `DELETE`, regardless of UI language).
3. **Reason-required correction** — an auditable correction to money, time,
   or state (voiding a session, adjusting points, overriding a booking).
   Free-text reason field, mandatory, submit disabled until non-empty. Not a
   dialog — an inline reveal within the record being corrected, so the
   context stays visible while typing the reason.

## Forms

- Label **above** the field, `--text-base` `--weight-semibold`, `mb-1.5`.
- Helper text below the label in `--text-xs` `--color-text-muted`.
- Field-level error replaces helper text, `--color-danger`, plus a red
  field border. Never both a helper and an error at once.
- Form-level error (submit failed): a line above the submit button,
  `--color-danger` on `--color-danger-soft`, rounded `--r-md`.
- No native `window.confirm()` / `window.alert()` anywhere. Ever.

## Lists

Dual render: a real `<table>` at `md:` and up, stacked cards below `md:`.
Every list screen gets both branches — no screen ships desktop-only or
mobile-only.

- Table head: `--text-2xs` uppercase `--tracking-caps` `--color-text-muted`.
- Row: hover tint `--color-surface-alt`, divider `--color-line`.
- Card (mobile): `--r-lg`, `--shadow-sm`, `--space-3` padding, identity block
  first, status pill right-aligned, action icons in a trailing row.

## Empty states

Icon tile (`--r-lg`, `--color-surface-alt`, centered lucide icon) → message
(`--text-sm`, `--color-text-muted`) → optional CTA text link. Centered,
`py-14`. Every list screen needs one — a bare `.map()` over nothing is not
acceptable.

## Loading

Route-level `loading.tsx` that mirrors the real page's layout (same
container width, same grid, same card shapes) — never a spinner in the
content area. Button-level pending state: label swaps to a present-tense
verb ("Saving…") and the button disables; no separate spinner overlay
unless the action has no visible target (e.g. a file export).

## Toasts

One shared library (`sonner`), one placement: `position="bottom-center"`.
Success = brief, auto-dismiss. Error stays until dismissed or the retried
action succeeds. No hand-rolled `setTimeout` toasts, no per-screen banner
reinventing this.

## Modals / dialogs

Native `<dialog>`-backed or a portal — never `position: absolute` inside an
`overflow: hidden` ancestor. Backdrop `--color-text-primary` at low opacity,
not pure black. `--r-xl` panel, `--shadow-lg`. Escape closes. Focus moves
into the dialog on open and returns to the trigger on close. `role="dialog"`
`aria-modal="true"` always.

## Icons

`lucide-react` only — no inline SVG for a new icon, no emoji anywhere in the
UI. Sizes: 16px inline/button, 18–20px nav, 28px empty-state tile.

## Language

- One cookie, name `lang`, `path=/`, 1-year, `SameSite=Lax`, shared across
  all three apps on the hub origin. Switching language in any one app is
  reflected in the other two on next navigation.
- `<html lang="en"|"my">` set server-side from the cookie — no flash of the
  wrong language.
- Burmese leading/spacing is handled once, at the root (`html[lang="my"]` in
  `design/tokens.css`) — do not add a per-element `lang === 'my' ? 'my' :
  ''` className anywhere new. Use the `.my` / `.mm` class only for a single
  Burmese string sitting inside an otherwise-English page.
- Every new user-facing string ships in both English and Burmese in the same
  change. No string ships English-only "for now."

## Color

- Neutrals and semantic state (success/warning/danger/info) are shared —
  `design/tokens.css`. Only `--color-primary`/`--color-accent` differ per
  app, selected by `data-app` on `<html>`.
- Accent color marks primary actions, current selection, and state
  indicators only — never decoration.
- Body text must clear 4.5:1 against its surface. If it's close, darken the
  text — do not lighten the surface to compensate.

## Explicitly not covered here

Server actions, RPCs, RLS policies, `middleware.ts` / `proxy.ts` auth
guards, billing math, booking math, Supabase client setup, export builders,
`app_access` provisioning, audit-log data model. Changing any of those is
out of scope for a design-contract change.
