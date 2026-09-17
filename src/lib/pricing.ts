import type { OrderLine, Pricing, Tier } from "./types";

/**
 * THE BILLING RULE. Mirrors game.bill_minutes(), which both game.close_session()
 * and game.record_session() charge through, so there is one rule in the database
 * and one here - not four.
 *
 *   billed = max(minMinutes, ceil(max(0, minutes - grace) / increment) * increment)
 *   after  = max(minMinutes, billed - min(max(waiveBlocks, 0), 1) * increment)
 *
 * Grace is subtracted from the total rather than granted once, so it shifts
 * EVERY block boundary: a customer three minutes past the hour pays for the
 * hour, whichever hour it is. That is the property that prevents the argument at
 * the counter, and it holds by construction.
 *
 * The server is authoritative. This exists so the staff member watching the tile
 * sees the number they are about to charge rather than an approximation, and
 * pricing.test.ts asserts the same table of boundaries that
 * 97-game-live-sessions.sql asserts against the database - if one drifts, one of
 * those two suites goes red.
 */
function billMinutes(minutes: number, pricing: Pricing, waiveBlocks = 0): number {
  // The pricing CHECK makes a non-positive increment impossible in the database,
  // where bill_minutes raises on one. Here it is clamped instead: a preview must
  // never be the thing that blanks the floor screen.
  const increment = Math.max(1, pricing.incrementMinutes);
  const afterGrace = Math.max(0, minutes - pricing.graceMinutes);
  const billed = Math.max(pricing.minMinutes, Math.ceil(afterGrace / increment) * increment);
  const waive = Math.min(Math.max(waiveBlocks, 0), 1) * increment;
  return Math.max(pricing.minMinutes, billed - waive);
}

/**
 * Multiply before dividing, matching the SQL exactly. Two paths to the same
 * total must not disagree by a kyat at a rounding boundary.
 */
function playtimeCharge(chargedMinutes: number, ratePerHour: number): number {
  return Math.round((ratePerHour * chargedMinutes) / 60);
}

/**
 * Playtime charge for a session TYPED IN afterwards.
 *
 * This used to be per-minute proration floored at the minimum, on the reasoning
 * that a typed-in duration is a number somebody already agreed to and rounding
 * it up invents money. That was wrong: a duration is not a price. The price is
 * whatever the rule says that duration costs, and billing per-minute here meant
 * the same hour cost differently depending on which screen it was entered from -
 * 62 minutes was 62 min typed in and 60 min on a timer, 36 minutes was 36 typed
 * in and 40 on a timer. Not even consistently cheaper, so no price could be
 * quoted in advance and no day's takings could be reconciled against a rule.
 *
 * One duration, one price, whichever door it came through. Mirrors
 * game.record_session().
 */
export function computePlaytime(
  minutes: number,
  pricing: Pricing,
): { chargedMinutes: number; total: number } {
  const chargedMinutes = billMinutes(minutes, pricing);
  return { chargedMinutes, total: playtimeCharge(chargedMinutes, pricing.ratePerHour) };
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
 * The bill for a LIVE session, mirroring game.close_session() exactly. Same rule
 * as computePlaytime above - the only difference is that the minutes here were
 * measured by a timer instead of typed in, and that a block can be waived.
 */
export function computeLiveBill(
  elapsedMinutes: number,
  pricing: Pricing,
  waiveBlocks = 0,
): { billedMinutes: number; chargedMinutes: number; waivedMinutes: number; playtimeTotal: number } {
  const billedMinutes = billMinutes(elapsedMinutes, pricing, 0);
  const chargedMinutes = billMinutes(elapsedMinutes, pricing, waiveBlocks);

  return {
    billedMinutes,
    chargedMinutes,
    // What was ACTUALLY waived, which is not what was asked for when the request
    // would have pushed the bill below the tier minimum.
    waivedMinutes: billedMinutes - chargedMinutes,
    playtimeTotal: playtimeCharge(chargedMinutes, pricing.ratePerHour),
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
