import "server-only";

import { createClient } from "@/lib/supabase/server";
import { mapPricingRows, mapSoldPricing } from "@/lib/pricing";
import { mapPointRule, mapTierPoints } from "@/lib/points";
import type { ActiveSession, OrderLine, PointRule, Pricing, Product, Tier } from "@/lib/types";

/**
 * One open session, for its own screen.
 *
 * Read on the server like everything else here: Myanmar operators block
 * *.supabase.co, so a browser-side read works in development and fails for the
 * staff who actually use this.
 */

export type LiveSessionData =
  | { ok: true; session: ActiveSession; pricing: Pricing; products: Product[]; pointRule: PointRule | null }
  | { ok: false; message: string };

export async function getLiveSession(sessionId: string): Promise<LiveSessionData> {
  const supabase = await createClient();

  const [sessionRes, pricingRes, tiersRes, productsRes, ruleRes, tierPointsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id,station_id,station_name,tier,rate_per_hour,sold_pricing,started_at,label,status," +
          "customer_id,customer_name,customer_phone," +
          "order_lines(id,product_id,product_name,qty,unit_price,line_total)",
      )
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("pricing").select("tier,rate_per_hour,min_minutes,increment_minutes,grace_minutes"),
    supabase.from("pricing_tiers").select("tier,duration_minutes,rate"),
    supabase.from("products").select("id,name_en,name_my,category,price,stock,active").eq("active", true),
    // The points rule lives in the hub's public schema (shared by all three
    // businesses). Optional: a failed read hides the points hint, nothing more.
    supabase.schema("public").from("point_rules")
      .select("block_minutes,points_per_block,is_active").eq("app", "game").maybeSingle(),
    // Points per hour by tier (game-tier-points-migration.sql). Optional too:
    // before that migration the column is missing and the shop-wide rule is shown.
    supabase.from("pricing").select("tier,points_per_hour"),
  ]);

  // Errors are read, not discarded: a denied read and a broken one must not
  // both arrive here as "not found".
  const failure = sessionRes.error ?? pricingRes.error ?? tiersRes.error ?? productsRes.error;
  if (failure) {
    console.error("[live-session] read failed", {
      sessionId,
      code: failure.code,
      message: failure.message,
      details: failure.details,
      hint: failure.hint,
    });
    return { ok: false, message: `Could not load the session (${failure.code ?? "unknown"}).` };
  }

  const row = sessionRes.data as
    | {
        id: string;
        station_id: string;
        station_name: string;
        tier: Tier;
        rate_per_hour: number;
        sold_pricing: unknown;
        started_at: string | null;
        label: string | null;
        status: "active" | "closed";
        customer_id: string | null;
        customer_name: string | null;
        customer_phone: string | null;
        order_lines:
          | { id: string; product_id: string | null; product_name: string; qty: number; unit_price: number; line_total: number }[]
          | null;
      }
    | null;

  if (!row) {
    return { ok: false, message: "That session no longer exists. It may have been cancelled." };
  }
  // Closed is not an error, it is a race: two staff on two phones, one of them
  // closed it first. Say that plainly rather than showing a dead timer.
  if (row.status !== "active") {
    return { ok: false, message: "That session has already been closed." };
  }
  if (!row.started_at) {
    return { ok: false, message: "That session has no start time and cannot be billed live." };
  }

  const pricingList: Pricing[] = mapPricingRows(
    (pricingRes.data ?? []) as {
      tier: Tier;
      rate_per_hour: number;
      min_minutes: number;
      increment_minutes: number;
      grace_minutes: number;
    }[],
    (tiersRes.data ?? []) as { tier: Tier; duration_minutes: number; rate: number }[],
  );

  const pricing = pricingList.find((p) => p.tier === row.tier);
  if (!pricing) {
    return {
      ok: false,
      message: `No pricing is configured for ${row.tier}, so this session cannot be billed. Set it in Pricing.`,
    };
  }

  const orders: OrderLine[] = (row.order_lines ?? []).map((l) => ({
    id: l.id,
    productId: l.product_id ?? "",
    productName: l.product_name,
    qty: l.qty,
    unitPrice: Number(l.unit_price),
    lineTotal: Number(l.line_total),
  }));

  // The snapshot, not the current pricing row: a mid-session price change
  // must not move a bill the customer was already quoted.
  const soldPricing = mapSoldPricing(row.sold_pricing) ?? {
    points: [],
    minMinutes: pricing.minMinutes,
    incrementMinutes: pricing.incrementMinutes,
    graceMinutes: pricing.graceMinutes,
  };

  const session: ActiveSession = {
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_name,
    tier: row.tier,
    ratePerHour: Number(row.rate_per_hour),
    soldPricing,
    startedAt: row.started_at,
    label: row.label,
    orders,
    customer: row.customer_id
      ? { id: row.customer_id, name: row.customer_name ?? "", phone: row.customer_phone ?? "" }
      : null,
  };

  const products: Product[] = (productsRes.data ?? []).map((p) => ({
    id: p.id,
    nameEn: p.name_en,
    nameMy: p.name_my,
    category: p.category as Product["category"],
    price: Number(p.price),
    stock: p.stock,
    active: p.active,
  }));

  // Billing math reads from pricing.tiers, so the sold curve must be frozen
  // there too, not only in ratePerHour — min/increment/grace stay LIVE
  // (sourced from `pricing`, found above by tier), same as before.
  const frozenPricing: Pricing = {
    ...pricing,
    tiers: soldPricing.points.filter((p) => p.durationMinutes > 0),
    ratePerHour: Number(row.rate_per_hour),
  };

  if (ruleRes.error) {
    console.error("[live-session] points rule read failed", { code: ruleRes.error.code, message: ruleRes.error.message });
  }
  const shopRule = ruleRes.error ? null : mapPointRule(ruleRes.data);
  // Same rule the database will freeze on close: the shop switch, 60-minute
  // blocks, this tier's points per hour (game.session_point_rule).
  const tierPoints = tierPointsRes.error ? null : mapTierPoints(tierPointsRes.data)[session.tier];
  const pointRule: PointRule | null =
    shopRule && tierPoints !== undefined && tierPoints !== null
      ? { blockMinutes: 60, pointsPerBlock: tierPoints, isActive: shopRule.isActive }
      : shopRule;

  return { ok: true, session, pricing: frozenPricing, products, pointRule };
}
