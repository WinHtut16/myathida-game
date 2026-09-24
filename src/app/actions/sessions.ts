"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Three different repairs, deliberately kept apart.
 *
 * correctSessionAction - the duration was wrong. Re-prices the session in place
 * and keeps created_at, so the money stays on the day it was taken. The figures
 * it replaces are preserved on the row, so the history shows both.
 *
 * editSessionSnacksAction - the snacks were wrong: one forgotten, one added by
 * mistake, or the wrong quantity. A batch of add/remove/set-qty changes, one
 * reason, one save - not a reason per click, since the point is a "clumsy
 * admin" fixing several things at once. Deliberately its own action rather
 * than folded into correctSessionAction: a wrong duration and a forgotten
 * snack are different facts, and the common case is one without the other.
 *
 * voidSessionAction - the whole sale was wrong. Keeps the row and zeroes the
 * charge. Terminal: a cancelled session cannot then be corrected.
 *
 * None of these delete anything. A mistake that disappears is worse than a mistake.
 */
export interface ActionResult {
  ok: boolean;
  message?: string;
}

export type SnackEditChange =
  | { kind: "add"; productId: string; qty: number }
  | { kind: "remove"; orderLineId: string }
  | { kind: "setQty"; orderLineId: string; qty: number };

export async function correctSessionAction(
  sessionId: string,
  minutes: number,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: "Say why this session is being corrected." };
  }
  if (!Number.isInteger(minutes) || minutes <= 0) {
    return { ok: false, message: "Enter the correct length in whole minutes." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("correct_session", {
    p_session_id: sessionId,
    p_minutes: minutes,
    p_reason: trimmed,
  });

  if (error) {
    console.error("[sessions] correct failed", {
      sessionId, minutes,
      code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    switch (error.code) {
      case "42501":
        return { ok: false, message: "Only a superadmin can correct a session." };
      case "23503":
        return { ok: false, message: "That session was not found." };
      case "23514":
        // The server says exactly which rule was hit - still open, or already
        // cancelled - and that is more useful than anything generic here.
        return { ok: false, message: error.message };
      case "22023":
        return { ok: false, message: "Enter a reason and a length in whole minutes." };
      case "42883":
        return {
          ok: false,
          message:
            "Corrections are not set up yet. Run supabase/game-correct-session-migration.sql in the futsal Supabase project.",
        };
      default:
        return {
          ok: false,
          message: `Could not correct the session (${error.code ?? "unknown"}). ${error.message}`,
        };
    }
  }

  revalidatePath("/reports");
  return { ok: true };
}

export async function editSessionSnacksAction(
  sessionId: string,
  changes: SnackEditChange[],
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: "Say why the snacks are being changed." };
  }
  if (changes.length === 0) {
    return { ok: false, message: "Make at least one change first." };
  }
  for (const c of changes) {
    if (c.kind !== "remove" && (!Number.isInteger(c.qty) || c.qty <= 0)) {
      return { ok: false, message: "Quantities must be whole numbers of at least one." };
    }
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("edit_session_snacks", {
    p_session_id: sessionId,
    p_reason: trimmed,
    p_changes: changes.map((c) =>
      c.kind === "add"
        ? { kind: "add", product_id: c.productId, qty: c.qty }
        : c.kind === "remove"
          ? { kind: "remove", order_line_id: c.orderLineId }
          : { kind: "set_qty", order_line_id: c.orderLineId, qty: c.qty },
    ),
  });

  if (error) {
    console.error("[sessions] edit snacks failed", {
      sessionId, changes,
      code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    switch (error.code) {
      case "42501":
        return { ok: false, message: "Only active staff can edit a session's snacks." };
      case "23503":
      case "23514":
      case "22023":
        // The server names exactly which rule was hit - unknown item, out of
        // stock, session still open or cancelled - more useful than anything
        // generic here.
        return { ok: false, message: error.message };
      case "42883":
        return {
          ok: false,
          message:
            "Snack corrections are not set up yet. Run supabase/game-edit-session-snacks-migration.sql in the futsal Supabase project.",
        };
      default:
        return {
          ok: false,
          message: `Could not change the snacks (${error.code ?? "unknown"}). ${error.message}`,
        };
    }
  }

  revalidatePath("/reports");
  revalidatePath("/reports/sessions");
  revalidatePath("/products");
  return { ok: true };
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
