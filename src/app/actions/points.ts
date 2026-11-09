"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";

/**
 * Writes for the Points section. Each one is a hub public.loyalty_* function
 * that re-checks the caller in the database (game grant; owner for reward
 * edits), so a hidden button is a courtesy, never the boundary. Their
 * messages are already written for staff ("Only an owner can do this."), so
 * they pass through.
 */

const APP = "game";

export interface PointsActionResult {
  ok: boolean;
  message?: string;
}

type RpcError = { code?: string; message: string };

function fail(where: string, error: RpcError): PointsActionResult {
  console.error(`[points] ${where} failed`, { code: error.code, message: error.message });
  if (error.code === "PGRST202" || error.code === "42883") {
    return { ok: false, message: "Points need the latest database update (loyalty-zone-admin-migration.sql in the hub). Ask the owner to run it." };
  }
  return { ok: false, message: error.message };
}

function refresh() {
  revalidatePath("/points", "layout");
}

export interface RewardInput {
  id: string | null;
  name: string;
  nameMy: string;
  description: string;
  descriptionMy: string;
  pointsCost: number;
  stock: number | null;
}

export async function saveRewardAction(input: RewardInput): Promise<PointsActionResult & { id?: string }> {
  if (!input.name.trim()) return { ok: false, message: "Name is required." };
  if (!Number.isInteger(input.pointsCost) || input.pointsCost < 1) {
    return { ok: false, message: "Points cost must be a whole number of 1 or more." };
  }
  if (input.stock !== null && (!Number.isInteger(input.stock) || input.stock < 0)) {
    return { ok: false, message: "Stock must be empty (unlimited) or 0 or more." };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_save_reward", {
    p_app: APP,
    p_id: input.id,
    p_name: input.name,
    p_name_my: input.nameMy,
    p_description: input.description,
    p_description_my: input.descriptionMy,
    p_points_cost: input.pointsCost,
    p_stock: input.stock,
  });
  if (error) return fail("loyalty_save_reward", error);
  refresh();
  return { ok: true, id: String((data as { id?: string } | null)?.id ?? "") };
}

export async function setRewardActiveAction(id: string, active: boolean): Promise<PointsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("public")
    .rpc("loyalty_set_reward_active", { p_app: APP, p_id: id, p_active: active });
  if (error) return fail("loyalty_set_reward_active", error);
  refresh();
  return { ok: true };
}

export async function deleteRewardAction(id: string): Promise<PointsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase.schema("public").rpc("loyalty_delete_reward", { p_app: APP, p_id: id });
  if (error) return fail("loyalty_delete_reward", error);
  refresh();
  return { ok: true };
}

export async function resolveRequestAction(
  id: string,
  action: "approve" | "reject",
): Promise<PointsActionResult> {
  const supabase = await createClient();
  const { error } = await supabase
    .schema("public")
    .rpc("loyalty_resolve_request", { p_app: APP, p_id: id, p_action: action, p_notes: null });
  if (error) return fail("loyalty_resolve_request", error);
  refresh();
  return { ok: true };
}

export async function clearHistoryAction(ids: string[]): Promise<PointsActionResult & { removed?: number }> {
  if (ids.length === 0) return { ok: true, removed: 0 };
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("public")
    .rpc("loyalty_clear_history", { p_app: APP, p_ids: ids });
  if (error) return fail("loyalty_clear_history", error);
  refresh();
  return { ok: true, removed: Number(data ?? 0) };
}

export async function adjustPointsAction(
  customerId: string,
  delta: number,
  reason: string,
): Promise<PointsActionResult & { balance?: number }> {
  if (!Number.isInteger(delta) || delta === 0) return { ok: false, message: "Enter a whole number, not 0." };
  if (!reason.trim()) return { ok: false, message: "A reason is required." };

  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_adjust_points", {
    p_app: APP,
    p_customer: customerId,
    p_delta: delta,
    p_reason: reason.trim(),
  });
  if (error) return fail("loyalty_adjust_points", error);
  refresh();
  return { ok: true, balance: Number(data ?? 0) };
}

/** For the nav badge: polled from the browser, read on the server. */
export async function pendingCountAction(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_pending_count", { p_app: APP });
  if (error) return null;
  return Number(data ?? 0);
}
