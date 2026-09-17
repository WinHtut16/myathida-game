"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { PaymentMethod } from "@/lib/types";

/**
 * Writes for a live session: start, add a snack, remove one, close, cancel.
 *
 * Every one is a `game.*` RPC. Note what the browser never sends: no rate, no
 * elapsed time, no total. It has all of those on screen for the running
 * preview and none of them are trusted - close_session re-derives the charge
 * from started_at and the pricing row, so a tampered request cannot close a
 * three-hour VIP session for 500 MMK.
 */

export interface ActionResult {
  ok: boolean;
  /** Ready to put in front of a member of staff. Never a raw Postgres string. */
  message?: string;
}

/**
 * Postgres errors, translated for someone at a till with a customer waiting.
 *
 * The codes are the ones the game.* functions raise deliberately. 42883 gets
 * its own case because "function does not exist" means a migration has not
 * been run, and naming the file saves an hour of looking at the wrong layer.
 */
function explain(code: string | undefined, message: string): string {
  switch (code) {
    case "42501":
      return "This account is not allowed to run sessions for the game shop.";
    case "23505":
      return message; // "TV 3 already has a session running." — already readable
    case "23514":
      return message; // out of stock, under maintenance, session already closed
    case "23503":
      return message.includes("staff")
        ? "This account has access but no staff record yet, so the session cannot be attributed. Add a row in game.staff for it."
        : message;
    case "22023":
      return message;
    case "42883":
      return "Live sessions are not set up yet. Run supabase/game-live-sessions-migration.sql in the futsal Supabase project.";
    default:
      return `Could not complete that (${code ?? "unknown"}). ${message}`;
  }
}

function fail(where: string, context: Record<string, unknown>, error: { code?: string; message: string; details?: string | null; hint?: string | null }): ActionResult {
  console.error(`[live-session] ${where} failed`, {
    ...context,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  return { ok: false, message: explain(error.code, error.message) };
}

/** Refresh both the board and the session screen: staff move between them constantly. */
function revalidateSession(sessionId?: string) {
  revalidatePath("/floor");
  if (sessionId) revalidatePath(`/session/${sessionId}`);
}

export async function openSessionAction(
  stationId: string,
  label: string | null,
): Promise<ActionResult & { sessionId?: string }> {
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("open_session", {
    p_station_id: stationId,
    p_label: label?.trim() || null,
  });

  if (error) return fail("open_session", { stationId }, error);

  revalidatePath("/floor");
  return { ok: true, sessionId: data as string };
}

export async function addSessionItemAction(
  sessionId: string,
  productId: string,
  qty: number,
): Promise<ActionResult> {
  if (!Number.isFinite(qty) || qty <= 0) {
    return { ok: false, message: "Choose at least one." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("add_session_item", {
    p_session_id: sessionId,
    p_product_id: productId,
    p_qty: Math.floor(qty),
  });

  if (error) return fail("add_session_item", { sessionId, productId, qty }, error);

  // The shelf count moved, so the catalogue is stale too.
  revalidateSession(sessionId);
  revalidatePath("/products");
  return { ok: true };
}

export async function removeSessionItemAction(
  orderLineId: string,
  sessionId: string,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_session_item", {
    p_order_line_id: orderLineId,
  });

  if (error) return fail("remove_session_item", { orderLineId, sessionId }, error);

  revalidateSession(sessionId);
  revalidatePath("/products");
  return { ok: true };
}

export async function closeSessionAction(
  sessionId: string,
  paymentMethod: PaymentMethod,
  waiveBlocks = 0,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_session", {
    p_session_id: sessionId,
    p_payment_method: paymentMethod,
    p_waive_blocks: waiveBlocks ? 1 : 0,
  });

  if (error) return fail("close_session", { sessionId, paymentMethod, waiveBlocks }, error);

  revalidateSession(sessionId);
  revalidatePath("/reports");
  return { ok: true };
}

export async function cancelSessionAction(
  sessionId: string,
  reason: string,
): Promise<ActionResult> {
  const trimmed = reason.trim();
  if (!trimmed) {
    return { ok: false, message: "Say why this session is being cancelled." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("cancel_active_session", {
    p_session_id: sessionId,
    p_reason: trimmed,
  });

  if (error) return fail("cancel_active_session", { sessionId }, error);

  revalidateSession(sessionId);
  revalidatePath("/products");
  return { ok: true };
}
