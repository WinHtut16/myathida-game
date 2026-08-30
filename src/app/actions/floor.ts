"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Writes for the floor board.
 *
 * Both go through `game.*` RPCs rather than table writes, because both need
 * server-side authorisation and record_session additionally computes the money.
 * The client sends what it knows - which station, how many minutes, which
 * products - and nothing it sends decides a price.
 */

export interface ActionResult {
  ok: boolean;
  /** Ready to show a member of staff. Never a raw Postgres string. */
  message?: string;
}

/**
 * Postgres errors, translated for someone standing at a till mid-shift.
 *
 * The codes are the ones game.record_session() raises deliberately; anything
 * else falls through to a generic message with the code attached, so an
 * unexpected failure is still traceable in the logs without putting
 * `null value in column "created_by"` in front of a customer.
 */
function explain(code: string | undefined, message: string): string {
  switch (code) {
    case "42501":
      return "This account is not allowed to record sessions for the game shop.";
    case "23514":
      // Raised for both an out-of-stock item and a delisted one; the message
      // from Postgres names the product, so it is worth passing through.
      return message;
    case "23503":
      // A missing game.staff row lands here: sessions.created_by is a NOT NULL
      // foreign key to it, so a grant on its own is not enough to record a
      // sale. This is the single most likely first-run failure.
      return "This account has access but no staff record yet, so the sale cannot be attributed. Add a row in game.staff for it.";
    case "22023":
      return "Enter a session length of at least one minute.";
    default:
      return `Could not save the session${code ? ` (${code})` : ""}. ${message}`;
  }
}

export async function setOccupiedAction(
  stationId: string,
  occupied: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();

  const { error } = await supabase.rpc("set_occupied", {
    p_station_id: stationId,
    p_occupied: occupied,
  });

  if (error) {
    console.error("[floor] set_occupied failed", {
      stationId,
      occupied,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }

  revalidatePath("/floor");
  return { ok: true };
}

export interface RecordSessionInput {
  stationId: string;
  minutes: number;
  items: { productId: string; qty: number }[];
  label: string | null;
}

export async function recordSessionAction(
  input: RecordSessionInput,
): Promise<ActionResult> {
  const supabase = await createClient();

  /**
   * Note what is NOT sent: no prices, no totals, no rate. The browser has all
   * of those on screen for the preview, and none of them are trusted. The
   * function re-derives every figure from the pricing and product rows, so a
   * tampered request cannot book a 90-minute VIP session for 300 MMK.
   */
  const { error } = await supabase.rpc("record_session", {
    p_station_id: input.stationId,
    p_minutes: input.minutes,
    p_items: input.items.filter((i) => i.qty > 0),
    p_label: input.label,
  });

  if (error) {
    console.error("[floor] record_session failed", {
      stationId: input.stationId,
      minutes: input.minutes,
      itemCount: input.items.length,
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }

  revalidatePath("/floor");
  revalidatePath("/reports");
  return { ok: true };
}
