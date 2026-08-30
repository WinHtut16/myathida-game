/**
 * Supabase client factory (not wired yet - see .env.example).
 *
 * ─────────────────────────────────────────────────────────────────────────────
 * SERVER ONLY. There is no browser Supabase client in this app and there must
 * not be one.
 *
 * Myanmar ISPs block *.supabase.co. A client-side createClient() would work on
 * every machine you develop and test from, and fail for the shop staff who
 * actually use it. So the browser talks only to our own origin; the server
 * talks to Supabase. Both futsal and billiards are built this way.
 *
 * Practical consequences for anyone adding a screen here:
 *   - reads happen in server components
 *   - writes happen in server actions calling the `game.*` RPCs
 *   - the env vars carry NO NEXT_PUBLIC_ prefix, so importing this file from a
 *     "use client" component gets you undefined, not a leak
 * ─────────────────────────────────────────────────────────────────────────────
 *
 * When wiring it up, install @supabase/supabase-js and mirror the billiards
 * repo's src/lib/supabase/ - in particular db: { schema: "game" }, without
 * which PostgREST looks in `public` and returns confusing 404s.
 */

import "server-only";

export const dataSource = process.env.DATA_SOURCE ?? "mock";

export function isSupabaseConfigured(): boolean {
  return (
    dataSource === "supabase" &&
    !!process.env.SUPABASE_URL &&
    !!process.env.SUPABASE_PUBLISHABLE_KEY
  );
}
