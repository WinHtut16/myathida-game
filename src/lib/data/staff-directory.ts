import "server-only";

import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export interface DirectoryRow {
  id: string;
  name: string;
  phone: string | null;
  email: string | null;
  role: string;
  active: boolean;
}

/**
 * The staff directory, fetched at most once per request.
 *
 * The root layout needs it to know who is signed in, and Reports needs it to
 * put names against sessions - so every load of that screen was making the
 * same round trip twice, ~95ms each from sin1 to the Sydney project, for
 * identical data. React's cache() dedupes it within a single render pass.
 *
 * Deliberately NOT cached across requests: this decides what rank the UI
 * shows, and a revoked grant must take effect on the next page load rather
 * than whenever a cache happens to expire.
 */
export const getStaffDirectory = cache(async (): Promise<DirectoryRow[] | null> => {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("staff_directory");
  if (error) {
    console.error("[staff] staff_directory failed", {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return null;
  }
  return (data as DirectoryRow[] | null) ?? [];
});
