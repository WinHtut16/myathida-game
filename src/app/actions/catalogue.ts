"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ProductCategory, Tier } from "@/lib/types";

export interface PricingTierInput {
  durationMinutes: number;
  rate: number;
}

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

  /**
   * Through game.set_product_active() rather than a table update: that RPC is
   * open to any active staff, while the products table's own RLS policy
   * (which also covers name/price edits) stays superadmin-only. A plain
   * table update here would have to pick one or the other for every column.
   */
  const { error } = await supabase.rpc("set_product_active", {
    p_product_id: id,
    p_active: active,
  });

  if (error) {
    console.error("[catalogue] toggle failed", {
      id, active, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    if (error.code === "42883") {
      return {
        ok: false,
        message:
          "Enabling/disabling products is not set up yet. Run supabase/game-admin-permissions-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: explain(error.code, error.message) };
  }

  revalidatePath("/products");
  revalidatePath("/floor");
  return { ok: true };
}

/**
 * Deleting a product outright, not just delisting it.
 *
 * Through game.delete_product() rather than a table DELETE: the function is
 * superadmin-only and the migration that adds it also changes
 * order_lines.product_id to ON DELETE SET NULL, so a snack that has already
 * been sold can still be removed without erasing the sale - the order line
 * keeps its snapshotted product_name and Reports stay correct.
 */
export async function deleteProductAction(id: string): Promise<ActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_product", { p_id: id });

  if (error) {
    console.error("[catalogue] product delete failed", {
      id, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    if (error.code === "42883") {
      return {
        ok: false,
        message:
          "Deleting products is not set up yet. Run supabase/game-product-delete-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: explain(error.code, error.message) };
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

/**
 * Replaces ALL duration tiers for one station tier in one call, via an RPC -
 * a deliberate exception to this file's own "plain writes, no RPC" rule
 * above. That rule holds for a single scalar field; this replaces a
 * variable-length list of rows (delete-then-insert), which two separate
 * `.from(...)` calls from here could not do atomically.
 */
export async function updatePricingAction(
  tier: Tier,
  tiers: PricingTierInput[],
  minMinutes: number,
  incrementMinutes: number,
  graceMinutes: number,
): Promise<ActionResult> {
  if (tiers.length === 0) {
    return { ok: false, message: "Pricing needs at least one duration tier." };
  }
  for (const t of tiers) {
    if (!Number.isInteger(t.durationMinutes) || t.durationMinutes <= 0) {
      return { ok: false, message: "Each duration must be a whole number of minutes, more than zero." };
    }
    if (!Number.isFinite(t.rate) || t.rate < 0) {
      return { ok: false, message: "Each price must be zero or more." };
    }
  }
  const durations = tiers.map((t) => t.durationMinutes);
  if (new Set(durations).size !== durations.length) {
    return { ok: false, message: "Each duration can only be priced once." };
  }
  if (!durations.includes(60)) {
    return { ok: false, message: "Pricing needs a 60-minute rate — everything else is based on it." };
  }
  if (!Number.isInteger(minMinutes) || minMinutes < 0) {
    return { ok: false, message: "Minimum minutes must be a whole number, zero or more." };
  }
  // A zero block size would divide by zero in the billing rule, so this is a
  // guard rather than a preference. The database has the same check.
  if (!Number.isInteger(incrementMinutes) || incrementMinutes < 1) {
    return { ok: false, message: "Block size must be a whole number of at least 1 minute." };
  }
  if (!Number.isInteger(graceMinutes) || graceMinutes < 0) {
    return { ok: false, message: "Grace must be a whole number, zero or more." };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("replace_pricing_tiers", {
    p_tier: tier,
    p_points: tiers.map((t) => ({ duration_minutes: t.durationMinutes, rate: t.rate })),
    p_min_minutes: minMinutes,
    p_increment_minutes: incrementMinutes,
    p_grace_minutes: graceMinutes,
  });

  if (error) {
    console.error("[catalogue] pricing write failed", {
      tier, code: error.code, message: error.message,
      details: error.details, hint: error.hint,
    });
    if (error.code === "42883") {
      return {
        ok: false,
        message:
          "Per-duration pricing is not set up yet. Run supabase/game-pricing-tiers-migration.sql in the futsal Supabase project.",
      };
    }
    return { ok: false, message: explain(error.code, error.message) };
  }

  /**
   * Only future sessions are affected. open_session/record_session snapshot
   * the full tier curve onto every row they write, so changing prices here
   * never rewrites what a customer was already charged - which is why the
   * receipts in Reports stay correct after a price rise.
   */
  revalidatePath("/pricing");
  revalidatePath("/floor");
  return { ok: true };
}

/**
 * Save the game shop's points rule. public.set_point_rule re-checks that the
 * caller is the game shop's superadmin and audits the change; this only
 * pre-validates so the message reads well.
 */
export async function setPointRuleAction(
  blockMinutes: number,
  pointsPerBlock: number,
  isActive: boolean,
): Promise<ActionResult> {
  if (!Number.isInteger(blockMinutes) || blockMinutes < 1 || blockMinutes > 1440) {
    return { ok: false, message: "Block length must be between 1 and 1440 minutes." };
  }
  if (!Number.isInteger(pointsPerBlock) || pointsPerBlock < 0 || pointsPerBlock > 100000) {
    return { ok: false, message: "Points per block must be between 0 and 100000." };
  }

  const supabase = await createClient();
  const { error } = await supabase.schema("public").rpc("set_point_rule", {
    p_app: "game",
    p_block_minutes: blockMinutes,
    p_points_per_block: pointsPerBlock,
    p_is_active: isActive,
  });

  if (error) {
    console.error("[catalogue] set_point_rule failed", { code: error.code, message: error.message });
    return { ok: false, message: error.message };
  }

  revalidatePath("/pricing");
  return { ok: true };
}
