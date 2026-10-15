import type { OrderLine, Pricing, PricingTier, SoldPricing, Tier } from "./types";

/** Shared shape billMinutes() needs — both Pricing and SoldPricing satisfy it. */
interface BillingRule {
  minMinutes: number;
  incrementMinutes: number;
  graceMinutes: number;
}

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
function billMinutes(minutes: number, rule: BillingRule, waiveBlocks = 0): number {
  // The pricing CHECK makes a non-positive increment impossible in the database,
  // where bill_minutes raises on one. Here it is clamped instead: a preview must
  // never be the thing that blanks the floor screen.
  const increment = Math.max(1, rule.incrementMinutes);
  const afterGrace = Math.max(0, minutes - rule.graceMinutes);
  const billed = Math.max(rule.minMinutes, Math.ceil(afterGrace / increment) * increment);
  const waive = Math.min(Math.max(waiveBlocks, 0), 1) * increment;
  return Math.max(rule.minMinutes, billed - waive);
}

/**
 * Materializes the implicit (0,0) origin in front of the admin-set points,
 * sorted ascending. Every lookup goes through points shaped this way — the
 * live tier list here, and a session's frozen SoldPricing.points already
 * shaped this way by game.pricing_curve() — so tierRate() never special-
 * cases where the curve starts.
 */
function curveOf(tiers: PricingTier[]): PricingTier[] {
  return [{ durationMinutes: 0, rate: 0 }, ...tiers].sort(
    (a, b) => a.durationMinutes - b.durationMinutes,
  );
}

/**
 * Piecewise-linear lookup over points already including the origin, for any
 * duration up to the highest configured point: finds the bracketing
 * segment and interpolates. `points.length === 1` when zero tiers are
 * configured (curveOf's origin is the only point, pricing at 0);
 * `points.length === 0` for a bare SoldPricing snapshot with no points at
 * all — previewCorrection() passes soldPricing.points directly, skipping
 * curveOf, and the floor/live-session zeroed fallback for a missing
 * snapshot is exactly this shape. Both degenerate the same way: nothing
 * configured prices at 0.
 *
 * BEYOND the highest configured point, the price is NOT a linear guess off
 * the last segment's slope — it repeats the highest tier's own price once
 * per whole multiple of its duration, plus whatever the leftover minutes
 * cost under the ordinary interpolation above. This matches how a long
 * session is actually priced: N whole blocks of the biggest bundle set,
 * plus whatever's left, not a straight line extended past the last number
 * anyone typed. `remainder` is always `< top.durationMinutes` by
 * construction, so the one recursive call always lands in the ordinary
 * branch and never recurses again.
 */
function tierRate(minutes: number, points: PricingTier[]): number {
  if (points.length === 0) return 0;
  if (points.length === 1) return points[0].rate;

  const top = points[points.length - 1];
  if (minutes > top.durationMinutes) {
    const k = Math.floor(minutes / top.durationMinutes);
    const remainder = minutes - k * top.durationMinutes;
    return k * top.rate + tierRate(remainder, points);
  }

  let lo = points[0];
  let hi = points[1];
  for (let i = 0; i < points.length - 1; i++) {
    lo = points[i];
    hi = points[i + 1];
    if (minutes <= hi.durationMinutes) break;
  }
  const slope = (hi.rate - lo.rate) / (hi.durationMinutes - lo.durationMinutes);
  return lo.rate + slope * (minutes - lo.durationMinutes);
}

/**
 * Multiply before dividing, matching the SQL exactly. Two paths to the same
 * total must not disagree by a kyat at a rounding boundary. `rate` here is
 * already the TOTAL price at chargedMinutes (tierRate already did the
 * proportioning), so this is just the rounding step, not another divide.
 */
function playtimeCharge(chargedMinutes: number, tiers: PricingTier[]): number {
  return Math.round(tierRate(chargedMinutes, curveOf(tiers)));
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
  return { chargedMinutes, total: playtimeCharge(chargedMinutes, pricing.tiers) };
}

/**
 * What a settled session will cost after a superadmin re-prices it, mirroring
 * game.correct_session().
 *
 * Takes the session's OWN frozen pricing snapshot — blocks, grace, floor, and
 * the full tier curve as they were when the rate was decided — never today's
 * live pricing. A price rise since the customer paid must not move a bill
 * they already agreed to; taking a SoldPricing rather than a live Pricing
 * makes that structurally impossible rather than a convention to remember.
 *
 * Snacks ride along untouched: a wrong duration is not a wrong crisp packet.
 */
export function previewCorrection(
  minutes: number,
  soldPricing: SoldPricing,
  snacksTotal: number,
): { chargedMinutes: number; playtimeTotal: number; total: number } {
  const chargedMinutes = billMinutes(minutes, soldPricing);
  const total = Math.round(tierRate(chargedMinutes, soldPricing.points));
  return { chargedMinutes, playtimeTotal: total, total: total + snacksTotal };
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
    playtimeTotal: playtimeCharge(chargedMinutes, pricing.tiers),
  };
}

/** The two parallel column shapes `pricing` and `pricing_tiers` select as. */
interface PricingRowShape {
  tier: Tier;
  rate_per_hour: number;
  min_minutes: number;
  increment_minutes: number;
  grace_minutes: number;
}
interface PricingTierRowShape {
  tier: Tier;
  duration_minutes: number;
  rate: number;
}

/**
 * Assembles Pricing[] from the two selects every reader needs: `pricing`
 * (min/increment/grace, plus the rate_per_hour mirror) and `pricing_tiers`
 * (the admin-set duration/price points). Shared so floor.ts/live-session.ts/
 * catalogue.ts/reports.ts don't each reinvent this join.
 */
export function mapPricingRows(
  pricingRows: PricingRowShape[],
  tierRows: PricingTierRowShape[],
): Pricing[] {
  return pricingRows.map((p) => {
    const tiers = tierRows
      .filter((t) => t.tier === p.tier)
      .map((t) => ({ durationMinutes: t.duration_minutes, rate: Number(t.rate) }))
      .sort((a, b) => a.durationMinutes - b.durationMinutes);
    return {
      tier: p.tier,
      tiers,
      ratePerHour: tiers.find((t) => t.durationMinutes === 60)?.rate ?? Number(p.rate_per_hour),
      minMinutes: p.min_minutes,
      incrementMinutes: p.increment_minutes,
      graceMinutes: p.grace_minutes,
    };
  });
}

/**
 * Snake_case `sessions.sold_pricing` jsonb to camelCase SoldPricing. Null
 * only on a row written before this column existed and not yet backfilled.
 */
export function mapSoldPricing(json: unknown): SoldPricing | null {
  if (!json || typeof json !== "object") return null;
  const j = json as Record<string, unknown>;
  const points = Array.isArray(j.points)
    ? (j.points as Array<Record<string, unknown>>).map((p) => ({
        durationMinutes: Number(p.duration_minutes),
        rate: Number(p.rate),
      }))
    : [];
  return {
    points,
    minMinutes: Number(j.min_minutes),
    incrementMinutes: Number(j.increment_minutes),
    graceMinutes: Number(j.grace_minutes),
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
