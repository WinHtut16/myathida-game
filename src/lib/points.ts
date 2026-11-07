import type { PointRule } from "@/lib/types";

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

/** 09xxxxxxx shown as 09•••••1234 on shared screens. */
export function maskPhone(phone: string): string {
  return phone.length > 6 ? `${phone.slice(0, 2)}•••••${phone.slice(-4)}` : phone;
}
