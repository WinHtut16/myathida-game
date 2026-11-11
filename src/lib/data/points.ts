import "server-only";

import { createClient } from "@/lib/supabase/server";
import type {
  LoyaltyCustomer,
  LoyaltyCustomerRow,
  LoyaltyRequest,
  LoyaltyReward,
  LoyaltyTxn,
} from "@/lib/types";

/**
 * Points & rewards for the game shop.
 *
 * Everything goes through the hub's public.loyalty_* functions (shared
 * Supabase project): rewards, the ledger and redemption requests are written
 * only by the service role, and this zone has none. Each function checks in
 * the database that the caller holds a game grant (owner rank for reward
 * edits), so the check cannot be skipped from here.
 */

export const APP = "game" as const;

export type PointsResult<T> = { ok: true; data: T } | { ok: false; message: string };

type Raw = Record<string, unknown>;
const num = (v: unknown) => Number(v ?? 0);
const str = (v: unknown) => (v == null ? null : String(v));

function fail(where: string, error: { code?: string; message: string }): { ok: false; message: string } {
  console.error(`[points] ${where} failed`, { code: error.code, message: error.message });
  if (error.code === "PGRST202" || error.code === "42883") {
    return { ok: false, message: "Points need the latest database update (loyalty-zone-admin-migration.sql in the hub). Ask the owner to run it." };
  }
  return { ok: false, message: error.message };
}

export function mapReward(r: Raw): LoyaltyReward {
  return {
    id: String(r.id),
    name: String(r.name ?? ""),
    nameMy: str(r.name_my),
    description: str(r.description),
    descriptionMy: str(r.description_my),
    pointsCost: num(r.points_cost),
    stock: r.stock == null ? null : num(r.stock),
    isActive: Boolean(r.is_active),
  };
}

function mapRequest(r: Raw): LoyaltyRequest {
  const reward = (r.reward ?? {}) as Raw;
  const customer = (r.customer ?? {}) as Raw;
  return {
    id: String(r.id),
    status: r.status as LoyaltyRequest["status"],
    requestedAt: String(r.requested_at),
    resolvedAt: str(r.resolved_at),
    notes: str(r.notes),
    pointsCost: num(r.points_cost),
    reward: { id: String(reward.id), name: String(reward.name ?? ""), nameMy: str(reward.name_my) },
    customer: {
      id: String(customer.id),
      username: String(customer.username ?? ""),
      phone: str(customer.phone),
      balance: num(customer.balance),
    },
  };
}

export async function getRewards(): Promise<PointsResult<LoyaltyReward[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_rewards", { p_app: APP });
  if (error) return fail("loyalty_rewards", error);
  return { ok: true, data: ((data ?? []) as Raw[]).map(mapReward) };
}

export async function getReward(id: string): Promise<PointsResult<LoyaltyReward | null>> {
  const all = await getRewards();
  if (!all.ok) return all;
  return { ok: true, data: all.data.find((r) => r.id === id) ?? null };
}

export async function getRequests(scope: "pending" | "history"): Promise<PointsResult<LoyaltyRequest[]>> {
  const supabase = await createClient();
  const { data, error } = await supabase
    .schema("public")
    .rpc("loyalty_requests", { p_app: APP, p_scope: scope, p_limit: 200 });
  if (error) return fail("loyalty_requests", error);
  return { ok: true, data: ((data ?? []) as Raw[]).map(mapRequest) };
}

export async function getPendingCount(): Promise<number | null> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_pending_count", { p_app: APP });
  if (error) return null;
  return num(data);
}

export const CUSTOMERS_PAGE_SIZE = 20;

export async function getCustomers(
  search: string,
  page: number,
): Promise<PointsResult<{ total: number; rows: LoyaltyCustomerRow[] }>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_customers", {
    p_app: APP,
    p_search: search || null,
    p_limit: CUSTOMERS_PAGE_SIZE,
    p_offset: Math.max(0, page - 1) * CUSTOMERS_PAGE_SIZE,
  });
  if (error) return fail("loyalty_customers", error);
  const d = (data ?? {}) as Raw;
  return {
    ok: true,
    data: {
      total: num(d.total),
      rows: ((d.rows ?? []) as Raw[]).map((r) => ({
        id: String(r.id),
        username: String(r.username ?? ""),
        phone: str(r.phone),
        balance: num(r.balance),
        earned: num(r.earned),
        lastActivity: str(r.last_activity),
      })),
    },
  };
}

export async function getCustomer(id: string): Promise<PointsResult<LoyaltyCustomer>> {
  const supabase = await createClient();
  const { data, error } = await supabase.schema("public").rpc("loyalty_customer", { p_app: APP, p_customer: id });
  if (error) return fail("loyalty_customer", error);
  const d = (data ?? {}) as Raw;
  return {
    ok: true,
    data: {
      id: String(d.id),
      username: String(d.username ?? ""),
      phone: str(d.phone),
      createdAt: String(d.created_at),
      balance: num(d.balance),
      earned: num(d.earned),
      redeemed: num(d.redeemed),
      transactions: ((d.transactions ?? []) as Raw[]).map(
        (t): LoyaltyTxn => ({
          id: String(t.id),
          createdAt: String(t.created_at),
          pointsDelta: num(t.points_delta),
          type: t.transaction_type as LoyaltyTxn["type"],
          hoursPlayed: t.hours_played == null ? null : num(t.hours_played),
          note: str(t.note),
          rewardName: str(t.reward_name),
          fromSession: t.source_session_id != null,
        }),
      ),
    },
  };
}
