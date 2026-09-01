"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/lib/types";

/**
 * Editing your own name and reading language.
 *
 * Goes through game.update_own_profile(), which is SECURITY DEFINER with a
 * hard-coded auth.uid() target - so it can only ever touch the caller's own
 * row. That matters because game.staff carries a superadmin-only write policy:
 * right for adding and removing people, wrong for stopping someone correcting
 * the spelling of their own name. The function threads that needle without
 * loosening the policy.
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function updateOwnProfileAction(
  name: string,
  locale: Locale,
): Promise<ActionResult> {
  const trimmed = name.trim();
  if (!trimmed) return { ok: false, message: "Your name cannot be empty." };

  const supabase = await createClient();
  const { error } = await supabase.rpc("update_own_profile", {
    p_name: trimmed,
    p_lang: locale,
  });

  if (error) {
    console.error("[profile] update failed", {
      code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    if (error.code === "42501") {
      return { ok: false, message: "This account cannot edit its profile." };
    }
    if (error.code === "42883") {
      // The function does not exist yet - a migration has not been run. Say so
      // rather than "unknown error", because the fix is one SQL file away.
      return {
        ok: false,
        message:
          "Profile editing is not set up yet. Run supabase/game-profile-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: `Could not save (${error.code ?? "unknown"}). ${error.message}` };
  }

  revalidatePath("/account");
  revalidatePath("/settings");
  return { ok: true };
}
