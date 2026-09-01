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

  const directory = await getStaffDirectory();
  if (!directory) return null;

  const me = directory.find((r) => r.id === auth.user.id);

  // Signed in, but with no game.staff row - the same gap that makes recording
  // a session fail on the created_by foreign key. Returning null lets the
  // shell say so rather than inventing a name.
  if (!me || !me.active) return null;

  const role: Role = me.role === "superadmin" ? "superadmin" : "admin";
  return { id: me.id, name: me.name, role, isSuperadmin: role === "superadmin" };
}
