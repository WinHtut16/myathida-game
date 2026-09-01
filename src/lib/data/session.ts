import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getStaffDirectory } from "./staff-directory";
import type { Role } from "@/lib/types";

/**
 * Who is actually signed in.
 *
 * Until now the shell got this from the mock store, which meant the sidebar
 * showed "Su Su" to everyone and offered a "View as superadmin/admin" toggle
 * that anybody could flip. That never granted real power - RLS and the
 * `game.*` RPCs decide what a request may do, and they read auth.uid(), not
 * anything the browser claims - but a console that displays a fictional
 * identity and lets you pick your own rank is not something to put in front of
 * a client, and it hides genuine permission problems behind a fake pass.
 *
 * Rank comes from public.app_access via game.staff_directory(), so it is the
 * same source the database enforces with. The screens use it to decide what to
 * SHOW; they never use it to decide what is ALLOWED.
 */
export interface CurrentUser {
  id: string;
  name: string;
  role: Role;
  isSuperadmin: boolean;
}

export async function getCurrentUser(): Promise<CurrentUser | null> {
  if (!isSupabaseConfigured()) return null;

  const supabase = await createClient();

  const { data: auth, error: authError } = await supabase.auth.getUser();
  if (authError || !auth?.user) {
    // Not an error worth logging loudly: the zone's own URL is reachable
    // without a session, and the hub is what enforces sign-in.
    return null;
  }

  /**
   * Rank is asked of game.is_superadmin() directly, not read off the
   * directory row.
   *
   * The directory used to answer "admin" for a global superadmin: it read rank
   * from app_access alone, and a global superadmin holds no per-business grant
   * because they outrank the grants entirely. game-profile-migration.sql fixes
   * the directory, but this is the authoritative source either way - it is the
   * same function the RLS policies enforce with, so the badge in the sidebar
   * and the permission the database applies can never disagree.
   */
  const [directory, superRes] = await Promise.all([
    getStaffDirectory(),
    supabase.rpc("is_superadmin"),
  ]);
  if (!directory) return null;

  if (superRes.error) {
    console.error("[session] is_superadmin failed", {
      code: superRes.error.code,
      message: superRes.error.message,
    });
  }

  const me = directory.find((r) => r.id === auth.user.id);

  // Signed in, but with no game.staff row - the same gap that makes recording
  // a session fail on the created_by foreign key. Returning null lets the
  // shell say so rather than inventing a name.
  if (!me || !me.active) return null;

  // Denies on a failed lookup rather than assuming rank - never invert this.
  const isSuperadmin = superRes.error ? me.role === "superadmin" : superRes.data === true;
  const role: Role = isSuperadmin ? "superadmin" : "admin";
  return { id: me.id, name: me.name, role, isSuperadmin };
}
