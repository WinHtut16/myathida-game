import type { OrderLine, Pricing, Tier } from "./types";

/**
 * Playtime charge for a session TYPED IN afterwards. Per-minute proration with
 * a minimum charged duration.
 *
 *   charge = max(minutes, minMinutes) / 60 * ratePerHour
 *
 * Deliberately NOT the same rule as computeLiveBill below, and the difference
 * is principled rather than an oversight. The number here is a duration
 * somebody already agreed - "he had it for 45 minutes" - and rounding a
 * decision up to 50 would invent money the customer never agreed to pay. A
 * live timer measures reality instead, and reality needs rounding to be
 * practical. Mirrors game.record_session().
 */
export function computePlaytime(
  minutes: number,
  pricing: Pricing,
): { chargedMinutes: number; total: number } {
  const chargedMinutes = Math.max(minutes, pricing.minMinutes);
  const total = Math.round((chargedMinutes / 60) * pricing.ratePerHour);
  return { chargedMinutes, total };
}

export function rateFor(pricingList: Pricing[], tier: Tier): Pricing {
  return pricingList.find((p) => p.tier === tier) ?? pricingList[0];
}

export function snacksTotal(orders: OrderLine[]): number {
  return orders.reduce((sum, o) => sum + o.lineTotal, 0);
}

/** Preview a session total before it is recorded. */
export function previewTotal(
  minutes: number,
  pricing: Pricing,
  orders: OrderLine[],
): { chargedMinutes: number; playtimeTotal: number; snacksTotal: number; total: number } {
  const { chargedMinutes, total: playtimeTotal } = computePlaytime(minutes, pricing);
  const snacks = snacksTotal(orders);
  return { chargedMinutes, playtimeTotal, snacksTotal: snacks, total: playtimeTotal + snacks };
}

/**
 * The bill for a LIVE session, mirroring game.close_session() exactly.
 *
 *   billed = max(minMinutes, ceil(max(0, elapsed - grace) / increment) * increment)
 *   waived = min(max(waiveBlocks, 0), 1) * increment        // one block, never more
 *   after  = max(minMinutes, billed - waived)               // never through the floor
 *   charge = round(ratePerHour * after / 60)
 *
 * This function and that SQL function are the same rule written twice, which is
 * a liability unless something holds them together - so pricing.test.ts asserts
 * the identical table of boundaries that 97-game-live-sessions.sql asserts
 * against the database. If one drifts, one of those two suites goes red.
 *
 * The server is authoritative. This exists so the staff member watching the
 * tile sees the number they are about to charge, not an approximation of it.
 */
export function computeLiveBill(
  elapsedMinutes: number,
  pricing: Pricing,
  waiveBlocks = 0,
): { billedMinutes: number; chargedMinutes: number; waivedMinutes: number; playtimeTotal: number } {
  const increment = Math.max(1, pricing.incrementMinutes);
  const afterGrace = Math.max(0, elapsedMinutes - pricing.graceMinutes);

  const billedMinutes = Math.max(
    pricing.minMinutes,
    Math.ceil(afterGrace / increment) * increment,
  );
  const waiveRequest = Math.min(Math.max(waiveBlocks, 0), 1) * increment;
  const chargedMinutes = Math.max(pricing.minMinutes, billedMinutes - waiveRequest);

  return {
    billedMinutes,
    chargedMinutes,
    // What was ACTUALLY waived, which is not what was asked for when the
    // request would have pushed the bill below the tier minimum.
    waivedMinutes: billedMinutes - chargedMinutes,
    playtimeTotal: Math.round((pricing.ratePerHour * chargedMinutes) / 60),
  };
}

/** Minutes elapsed since the server said the session started. */
export function elapsedMinutes(startedAt: string, now: number = Date.now()): number {
  return Math.max(0, (now - new Date(startedAt).getTime()) / 60000);
}

/** The running total to show on a live tile or session screen. */
export function previewLiveTotal(
  startedAt: string,
  pricing: Pricing,
  orders: OrderLine[],
  now: number = Date.now(),
  waiveBlocks = 0,
): {
  elapsed: number;
  billedMinutes: number;
  chargedMinutes: number;
  waivedMinutes: number;
  playtimeTotal: number;
  snacksTotal: number;
  total: number;
} {
  const elapsed = elapsedMinutes(startedAt, now);
  const bill = computeLiveBill(elapsed, pricing, waiveBlocks);
  const snacks = snacksTotal(orders);
  return { elapsed, ...bill, snacksTotal: snacks, total: bill.playtimeTotal + snacks };
}

/** mm:ss for a running timer. Hours appear only once there is an hour to show. */
export function formatElapsed(totalMinutes: number): string {
  const totalSeconds = Math.floor(totalMinutes * 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const sec = totalSeconds % 60;
  const pad = (n: number) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(m)}:${pad(sec)}` : `${pad(m)}:${pad(sec)}`;
}
