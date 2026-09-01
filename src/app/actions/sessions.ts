"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Correcting a recorded session.
 *
 * Not a delete. game.void_session() keeps the row, zeroes the charge and
 * stamps who corrected it and why, so the mistake stays visible and every
 * total in Reports comes out right without needing to know about corrections.
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export async function voidSessionAction(
  sessionId: string,
  reason: string,
  returnSnacks: boolean,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: "Say why this session is being corrected." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("void_session", {
    p_session_id: sessionId,
    p_reason: trimmed,
    p_void_snacks: returnSnacks,
  });

  if (error) {
    console.error("[sessions] void failed", {
      sessionId, returnSnacks,
      code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    switch (error.code) {
      case "42501":
        return {
          ok: false,
          message: "Only a superadmin can correct a recorded session.",
        };
      case "23503":
        return {
          ok: false,
          message: "That session was not found, or it has already been corrected.",
        };
      case "22023":
        return { ok: false, message: "Say why this session is being corrected." };
      case "42883":
        // The function is missing - a migration has not been run. Name it
        // rather than reporting an unknown error.
        return {
          ok: false,
          message:
            "Corrections are not set up yet. Run supabase/game-corrections-migration.sql in the futsal Supabase project.",
        };
      default:
        return {
          ok: false,
          message: `Could not correct the session (${error.code ?? "unknown"}). ${error.message}`,
        };
    }
  }

  revalidatePath("/reports");
  revalidatePath("/products");
  return { ok: true };
}
