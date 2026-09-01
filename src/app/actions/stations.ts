"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { Station, Tier } from "@/lib/types";

/**
 * The floor plan. Superadmin-only at the database via stations_write_superadmin.
 *
 * Same trap as the catalogue: an UPDATE that RLS filters out returns success
 * and zero rows, so every write asks for the affected rows back and treats an
 * empty result as a refusal rather than reporting a save that did not happen.
 *
 * There is deliberately no delete. game.sessions.station_id references these
 * rows, so removing a TV that has ever been used would be refused by the
 * database - and the history is the point: last month's takings for "TV 6"
 * should not become unattributable because the TV was replaced. A station that
 * is gone goes to maintenance, which hides it from the floor board's usable
 * tiles while keeping its past sessions readable.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const DENIED =
  "Only a superadmin can change the floor plan. Ask the owner or manager to make this change.";

function explain(code: string | undefined, message: string): string {
  if (code === "42501") return DENIED;
  if (code === "23514") return "That is not a valid tier or status.";
  return `Could not save${code ? ` (${code})` : ""}. ${message}`;
}

export async function upsertStationAction(input: {
  id?: string;
  name: string;
  tier: Tier;
  status: Station["status"];
}): Promise<ActionResult> {
  const name = input.name.trim();
  if (!name) return { ok: false, message: "A station needs a name." };

  const supabase = await createClient();

  if (input.id) {
    const { data, error } = await supabase
      .from("stations")
      .update({ name, tier: input.tier, status: input.status })
      .eq("id", input.id)
      .select("id");

    if (error) {
      console.error("[stations] update failed", {
        id: input.id, code: error.code, message: error.message,
        details: error.details, hint: error.hint,
      });
      return { ok: false, message: explain(error.code, error.message) };
    }
    if (!data || data.length === 0) {
      console.warn("[stations] update affected 0 rows (RLS)", { id: input.id });
      return { ok: false, message: DENIED };
    }
  } else {
    // New stations go to the end of the board. Reading the current maximum
    // rather than counting rows: a shop that has ever renumbered would
    // otherwise collide two stations on the same position.
    const { data: last } = await supabase
      .from("stations")
      .select("sort_order")
      .order("sort_order", { ascending: false })
      .limit(1);
    const nextOrder = ((last?.[0]?.sort_order as number | undefined) ?? 0) + 1;

    const { data, error } = await supabase
      .from("stations")
      .insert({ name, tier: input.tier, status: input.status, sort_order: nextOrder })
      .select("id");

    if (error) {
      console.error("[stations] insert failed", {
        code: error.code, message: error.message, details: error.details, hint: error.hint,
      });
      return { ok: false, message: explain(error.code, error.message) };
    }
    if (!data || data.length === 0) {
      console.warn("[stations] insert affected 0 rows (RLS)");
      return { ok: false, message: DENIED };
    }
  }

  revalidatePath("/settings");
  revalidatePath("/floor");
  return { ok: true };
}

export async function setStationStatusAction(
  id: string,
  status: Station["status"],
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("stations")
    .update({ status })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[stations] status change failed", {
      id, status, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }
  if (!data || data.length === 0) {
    console.warn("[stations] status change affected 0 rows (RLS)", { id });
    return { ok: false, message: DENIED };
  }

  revalidatePath("/settings");
  revalidatePath("/floor");
  return { ok: true };
}
