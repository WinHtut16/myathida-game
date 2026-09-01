"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory, Tier } from "@/lib/types";

/**
 * Writes for Snacks and Pricing.
 *
 * These are plain table writes rather than RPCs, because unlike record_session
 * there is no money to derive - the value typed IS the value stored. RLS is
 * the whole authorisation: products and pricing carry write policies limited
 * to game.is_superadmin().
 *
 * ── The trap these all guard against ──────────────────────────────────────
 * An UPDATE that RLS filters out is NOT an error. Postgres reports success and
 * zero rows affected, so `if (error)` passes and the screen would happily say
 * "saved" while nothing changed - the worst possible outcome for a price. So
 * every write below asks for the affected rows back with .select() and treats
 * an empty result as a refusal. Verified against the policies: a plain admin's
 * update returns 0 rows and no error.
 */

export interface ActionResult {
  ok: boolean;
  message?: string;
}

const DENIED =
  "Only a superadmin can change the catalogue. Ask the owner or manager to make this change.";

function explain(code: string | undefined, message: string): string {
  switch (code) {
    case "42501":
      return DENIED;
    case "23505":
      return "Something with that name already exists.";
    case "23514":
      return message;
    default:
      return `Could not save${code ? ` (${code})` : ""}. ${message}`;
  }
}

export interface ProductInput {
  id?: string;
  nameEn: string;
  nameMy: string;
  category: ProductCategory;
  price: number;
  stock: number | null;
}

export async function upsertProductAction(input: ProductInput): Promise<ActionResult> {
  const nameEn = input.nameEn.trim();
  if (!nameEn) return { ok: false, message: "A product needs an English name." };
  if (!Number.isFinite(input.price) || input.price < 0) {
    return { ok: false, message: "Price must be zero or more." };
  }

  const supabase = await createClient();
  const row = {
    name_en: nameEn,
    // Falling back to the English name keeps the column NOT NULL satisfied and
    // is honest: better a Burmese-speaking staff member sees "Sprite" than an
    // empty cell where the product name should be.
    name_my: input.nameMy.trim() || nameEn,
    category: input.category,
    price: input.price,
    stock: input.stock,
  };

  const query = input.id
    ? supabase.from("products").update(row).eq("id", input.id).select("id")
    : supabase.from("products").insert({ ...row, active: true }).select("id");

  const { data, error } = await query;

  if (error) {
    console.error("[catalogue] product write failed", {
      id: input.id, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }
  if (!data || data.length === 0) {
    // No error, no rows: RLS filtered it. See the note at the top.
    console.warn("[catalogue] product write affected 0 rows (RLS)", { id: input.id });
    return { ok: false, message: DENIED };
  }

  revalidatePath("/products");
  revalidatePath("/floor");
  return { ok: true };
}

export async function setProductActiveAction(
  id: string,
  active: boolean,
): Promise<ActionResult> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("products")
    .update({ active })
    .eq("id", id)
    .select("id");

  if (error) {
    console.error("[catalogue] toggle failed", {
      id, active, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }
  if (!data || data.length === 0) {
    console.warn("[catalogue] toggle affected 0 rows (RLS)", { id });
    return { ok: false, message: DENIED };
  }

  revalidatePath("/products");
  revalidatePath("/floor");
  return { ok: true };
}

/**
 * Restocking. Deliberately an absolute count, not a delta: staff count what is
 * on the shelf, and "there are 14" is a fact they can check, whereas "add 6"
 * depends on the number already being right.
 *
 * null means the item is not stock-tracked (tap water, say) and record_session
 * skips the availability check for it.
 */
export async function setStockAction(
  id: string,
  stock: number | null,
  note?: string,
): Promise<ActionResult> {
  if (stock !== null && (!Number.isInteger(stock) || stock < 0)) {
    return { ok: false, message: "Stock must be a whole number, zero or more." };
  }

  const supabase = await createClient();

  /**
   * Through game.set_stock() rather than a table update, so the change lands
   * in game.stock_movements with a delta and an author. products.stock alone
   * answers "how many are there" and nothing else - when the count disagrees
   * with the shelf, and eventually it will, a bare integer offers no way to
   * find out why.
   */
  const { error } = await supabase.rpc("set_stock", {
    p_product_id: id,
    p_stock: stock,
    p_note: note ?? null,
  });

  if (error) {
    console.error("[catalogue] stock write failed", {
      id, stock, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    if (error.code === "42883") {
      return {
        ok: false,
        message:
          "Stock tracking is not set up yet. Run supabase/game-corrections-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: explain(error.code, error.message) };
  }

  revalidatePath("/products");
  revalidatePath("/floor");
  return { ok: true };
}

export async function updatePricingAction(
  tier: Tier,
  ratePerHour: number,
  minMinutes: number,
): Promise<ActionResult> {
  if (!Number.isFinite(ratePerHour) || ratePerHour < 0) {
    return { ok: false, message: "Rate must be zero or more." };
  }
  if (!Number.isInteger(minMinutes) || minMinutes < 0) {
    return { ok: false, message: "Minimum minutes must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("pricing")
    .update({ rate_per_hour: ratePerHour, min_minutes: minMinutes })
    .eq("tier", tier)
    .select("tier");

  if (error) {
    console.error("[catalogue] pricing write failed", {
      tier, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    return { ok: false, message: explain(error.code, error.message) };
  }
  if (!data || data.length === 0) {
    console.warn("[catalogue] pricing write affected 0 rows (RLS)", { tier });
    return { ok: false, message: DENIED };
  }

  /**
   * Only future sessions are affected. record_session snapshots rate_per_hour
   * onto every row it writes, so changing a price here never rewrites what a
   * customer was already charged - which is why the receipts in Reports stay
   * correct after a price rise.
   */
  revalidatePath("/pricing");
  revalidatePath("/floor");
  return { ok: true };
}
