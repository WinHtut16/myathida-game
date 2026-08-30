import "server-only";

import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

/**
 * Supabase clients for the game shop. SERVER ONLY - see ./client.ts for why
 * there is no browser client anywhere in this app.
 *
 * Session sharing across the three businesses works because this app is served
 * from the futsal origin through a rewrite, so the browser sends the futsal
 * session cookie here. We deliberately do NOT name the cookie: @supabase/ssr's
 * default is `sb-<project-ref>-auth-token`, and the futsal app pins its cookie
 * to exactly that same string. Both sides land on the same name by agreeing on
 * the default. If futsal ever changes its pinned name, this must change with
 * it - a mismatch does not error, it just silently signs everyone out.
 */
export async function createClient() {
  const cookieStore = await cookies();

  return createServerClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_PUBLISHABLE_KEY!,
    {
      /**
       * This app's tables live in the `game` schema of the shared futsal
       * project, not in `public`. Both .from() and .rpc() honour this.
       *
       * The schema must ALSO be listed under Settings > API > Exposed schemas
       * in the dashboard and SAVED, or every call returns 404 - which reads
       * exactly like a permissions problem and is nothing of the sort.
       */
      db: { schema: "game" },
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options),
            );
          } catch {
            // Called from a Server Component, where cookies are read-only.
            // Safe to ignore: the hub refreshes the session on every request.
          }
        },
      },
    },
  );
}

/**
 * Service-role client. Bypasses RLS entirely, so it is only for creating staff
 * accounts, which needs admin auth powers no signed-in user has. Never use it
 * to "fix" a permissions error - that removes the check rather than the cause.
 */
export function createServiceClient() {
  return createSupabaseClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SECRET_KEY!,
    {
      db: { schema: "game" },
      auth: { autoRefreshToken: false, persistSession: false },
    },
  );
}
