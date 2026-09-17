import "server-only";

import { createClient } from "@/lib/supabase/server";
import type { ActiveSession, OrderLine, Pricing, Product, Tier } from "@/lib/types";

/**
 * One open session, for its own screen.
 *
 * Read on the server like everything else here: Myanmar operators block
 * *.supabase.co, so a browser-side read works in development and fails for the
 * staff who actually use this.
 */

export type LiveSessionData =
  | { ok: true; session: ActiveSession; pricing: Pricing; products: Product[] }
  | { ok: false; message: string };

export async function getLiveSession(sessionId: string): Promise<LiveSessionData> {
  const supabase = await createClient();

  const [sessionRes, pricingRes, productsRes] = await Promise.all([
    supabase
      .from("sessions")
      .select(
        "id,station_id,station_name,tier,rate_per_hour,started_at,label,status," +
          "order_lines(id,product_id,product_name,qty,unit_price,line_total)",
      )
      .eq("id", sessionId)
      .maybeSingle(),
    supabase.from("pricing").select("tier,rate_per_hour,min_minutes,increment_minutes,grace_minutes"),
    supabase.from("products").select("id,name_en,name_my,category,price,stock,active").eq("active", true),
  ]);

  // Errors are read, not discarded: a denied read and a broken one must not
  // both arrive here as "not found".
  const failure = sessionRes.error ?? pricingRes.error ?? productsRes.error;
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
        started_at: string | null;
        label: string | null;
        status: "active" | "closed";
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

  const pricingList: Pricing[] = (pricingRes.data ?? []).map((p) => ({
    tier: p.tier as Tier,
    ratePerHour: Number(p.rate_per_hour),
    minMinutes: p.min_minutes,
    incrementMinutes: p.increment_minutes,
    graceMinutes: p.grace_minutes,
  }));

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

  const session: ActiveSession = {
    id: row.id,
    stationId: row.station_id,
    stationName: row.station_name,
    tier: row.tier,
    // The snapshot, not the current pricing row: a mid-session price change
    // must not move a bill the customer was already quoted.
    ratePerHour: Number(row.rate_per_hour),
    startedAt: row.started_at,
    label: row.label,
    orders,
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

  return { ok: true, session, pricing: { ...pricing, ratePerHour: Number(row.rate_per_hour) }, products };
}
