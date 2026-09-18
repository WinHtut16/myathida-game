import type { Session } from "@/lib/types";

/**
 * Revenue bucketing for the reports dashboard: pure and framework-free (no
 * `server-only`), so it can be unit tested directly — same split as
 * `src/lib/timeline.ts`. The Supabase read and the row cap live in
 * `src/lib/data/reports.ts`, which calls into this.
 *
 * The +06:30 Yangon offset is duplicated from `src/lib/data/yangon.ts` rather
 * than imported, for the same reason `timeline.ts` duplicates it: that module
 * is `server-only` and this one must not be.
 */
const YANGON_OFFSET_MIN = 6 * 60 + 30;

export interface Bucket {
  key: string;
  label: string;
  value: number;
}

function yangonDay(iso: string): string {
  const shifted = new Date(new Date(iso).getTime() + YANGON_OFFSET_MIN * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function yangonHour(iso: string): number {
  const shifted = new Date(new Date(iso).getTime() + YANGON_OFFSET_MIN * 60_000);
  return shifted.getUTCHours();
}

/** Midnight Yangon, `daysAgo` days back from `now`, as an absolute instant. */
function yangonMidnight(now: number, daysAgo: number): Date {
  const shifted = new Date(now + YANGON_OFFSET_MIN * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  return new Date(shifted.getTime() - YANGON_OFFSET_MIN * 60_000);
}

/** Whole Yangon calendar days between two YYYY-MM-DD keys (`to` minus `from`). */
function daysBetween(fromKey: string, toKey: string): number {
  const from = Date.parse(`${fromKey}T00:00:00Z`);
  const to = Date.parse(`${toKey}T00:00:00Z`);
  return Math.round((to - from) / 86_400_000);
}

/**
 * Daily revenue, one bucket per Yangon calendar day, zero-filled for days
 * with no sales.
 *
 * `days` is the window size for "today"/"7d"/"30d" — the span walks back
 * that many days from `now`, unchanged from before this was extracted.
 *
 * `days === null` ("all") is the case this fixes: the span now runs from the
 * EARLIEST session's Yangon day to today, zero-filled in between. The old
 * code sized the span by `distinctDays(sessions)` (a plain count) and then
 * walked back that many days from *today* — so once a shop had more distinct
 * selling days than it had been open for recently (a slow stretch, or simply
 * more than a year of history), the walk-back window fell short of the
 * earliest sale and dropped real revenue off the front of the chart.
 *
 * Bucketed in one pass over `sessions` into a Map, then read back per day —
 * the old version filtered the whole array once per bucket.
 */
export function bucketByDay(sessions: Session[], days: number | null, now: number): Bucket[] {
  const sums = new Map<string, number>();
  for (const s of sessions) {
    const key = yangonDay(s.createdAt);
    sums.set(key, (sums.get(key) ?? 0) + s.total);
  }

  let span: number;
  if (days !== null) {
    span = days;
  } else if (sums.size === 0) {
    span = 1;
  } else {
    const todayKey = yangonDay(new Date(now).toISOString());
    const earliestKey = [...sums.keys()].sort()[0];
    span = Math.max(1, daysBetween(earliestKey, todayKey) + 1);
  }

  const out: Bucket[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = yangonMidnight(now, i);
    const key = yangonDay(d.toISOString());
    out.push({ key, label: key.slice(5).replace("-", "/"), value: sums.get(key) ?? 0 });
  }
  return out;
}

/**
 * Hourly revenue, spanning the shop's own opening-hours range rather than the
 * full 0-23 (which would be mostly empty air). Falls back to 10-23 when there
 * are no sessions at all, matching the pre-extraction default.
 *
 * One pass over `sessions` into a Map, then a bounded loop (at most 24 hours)
 * to read it back — the old version filtered the whole array once per hour.
 */
export function bucketByHour(sessions: Session[]): Bucket[] {
  const sums = new Map<number, number>();
  for (const s of sessions) {
    const h = yangonHour(s.createdAt);
    sums.set(h, (sums.get(h) ?? 0) + s.total);
  }

  const hours = [...sums.keys()];
  const lo = hours.length ? Math.min(...hours) : 10;
  const hi = hours.length ? Math.max(...hours) : 23;

  const out: Bucket[] = [];
  for (let h = lo; h <= hi; h++) {
    out.push({ key: String(h), label: String(h).padStart(2, "0"), value: sums.get(h) ?? 0 });
  }
  return out;
}
