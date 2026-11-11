import type { PointRule, Tier } from "@/lib/types";

/**
 * Points a session earns: N per FULL block of paid minutes, nothing for a
 * part block (10 per hour: 59 min = 0, 119 min = 10, 120 min = 20).
 *
 * Display only. The ledger is written by the database
 * (public.sync_session_points) from the same rule, frozen per session, so
 * this can never award anything by itself.
 */
export function pointsFor(paidMinutes: number, rule: PointRule | null | undefined): number {
  if (!rule || !rule.isActive || rule.blockMinutes <= 0 || rule.pointsPerBlock <= 0) return 0;
  return Math.floor(Math.max(0, paidMinutes) / rule.blockMinutes) * rule.pointsPerBlock;
}

/** Shape of public.point_rules / sessions.points_rule, as stored. */
export function mapPointRule(raw: unknown): PointRule | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const block = Number(r.block_minutes);
  const per = Number(r.points_per_block);
  if (!Number.isFinite(block) || !Number.isFinite(per)) return null;
  return { blockMinutes: block, pointsPerBlock: per, isActive: Boolean(r.is_active) };
}

/**
 * game.pricing rows -> points per full hour by tier
 * (game-tier-points-migration.sql). Rows without a number are skipped.
 */
export function mapTierPoints(rows: unknown): Partial<Record<Tier, number>> {
  const out: Partial<Record<Tier, number>> = {};
  if (!Array.isArray(rows)) return out;
  for (const r of rows as { tier?: unknown; points_per_hour?: unknown }[]) {
    if (r.points_per_hour === null || r.points_per_hour === undefined) continue;
    const n = Number(r.points_per_hour);
    if (typeof r.tier === "string" && Number.isFinite(n)) out[r.tier as Tier] = n;
  }
  return out;
}

/** 09xxxxxxx shown as 09•••••1234 on shared screens. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 2)}•••••${phone.slice(-4)}` : phone;
}
