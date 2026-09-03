# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

**Design/UI work:** see [DESIGN.md](DESIGN.md) first — the pattern contract shared byte-identical with `PointSystem_AkoATP` and `Billiards_MyaThida` (button order, nav model, screen shapes, container widths, i18n rules). Shared tokens live in `design/tokens.css`. Both files must stay byte-identical across all three repos — after editing either, copy it to the other two and run `node scripts/check-design-sync.mjs`.

See [README.md](README.md) for stack, routes, roles, and project layout.

## Commands

```bash
npm run dev         # dev server, http://localhost:3000/admin/game/floor
npm run build        # production build
npm run start         # start production server
npm run typecheck     # tsc --noEmit — this repo has no test suite
```

## Zone architecture — read before touching routing, links, or Server Actions

This app is not a standalone site. It is a Next.js multi-zone deployment served
from the futsal app's origin under `/admin/game`, via a rewrite there. Full
rationale and the specific failure modes (trailing-slash redirect loops,
Server Action CSRF origin mismatches) are documented as inline comments in
`next.config.mjs` — read them before changing that file.

Consequences for day-to-day work:

- **Any link leaving `/admin/game`** (to `/admin/apps`, `/admin/staff`, the
  hub's login) must be a plain `<a href>`, never `next/link` — `next/link`
  does not know about the rewrite and the basePath doubles, producing a 404.
- **No browser Supabase client.** All reads live in `src/lib/data/*`, all
  writes in `src/actions/*`, both server-only. Several Myanmar mobile
  networks block `*.supabase.co` outright at the ISP level; server-to-server
  calls from Vercel are unaffected. If a client component needs live data,
  poll with `useAutoRefresh` (`router.refresh()`), not a Realtime channel.
- **Sign-in is not implemented here.** `/login` is a vestigial static page.
  Real auth happens on the hub at `/admin/login`; this app only reads the
  resulting session via `getCurrentUser()`.
- **No PWA manifest in this repo.** The hub's manifest is scoped to `/admin`
  and already covers all three businesses — a second in-scope manifest here
  would be ambiguous. Do not add one.
- **Role decides what to show, never what is allowed.** Every mutating
  server action re-checks the caller's role itself; a hidden nav item or
  disabled button is a UX courtesy, not the authorization boundary.
