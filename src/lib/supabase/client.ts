/**
 * Supabase client factory (not wired yet).
 *
 * When you install @supabase/supabase-js and set the env vars in .env.local,
 * replace the body below with the real createClient call and implement the
 * Repository interface in ../data/repository.ts against it.
 *
 *   import { createClient } from "@supabase/supabase-js";
 *   export const supabase = createClient(URL, ANON_KEY);
 */

export const dataSource = process.env.NEXT_PUBLIC_DATA_SOURCE ?? "mock";

export function isSupabaseConfigured(): boolean {
  return (
    dataSource === "supabase" &&
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  );
}
