import type { OrderLine, Pricing, Tier } from "./types";

/**
 * Playtime charge. Per-minute proration from the hourly rate, with a minimum
 * charged duration (default 30 min, configurable per tier in Pricing admin).
 *
 *   charge = max(minutes, minMinutes) / 60 * ratePerHour
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
