import "server-only";

import { createClient } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/client";
import { getStaffDirectory } from "./staff-directory";
import { YANGON_OFFSET_MIN, yangonDay, yangonDayStart } from "./yangon";
import type { OrderLine, Session, Tier } from "@/lib/types";

/**
 * Server-side reads and aggregation for the reports screen.
 *
 * The Yangon-local date maths this leans on (why a fixed +06:30 offset is
 * correct, why UTC bucketing would be wrong) lives in ./yangon.
 */

/** Local hour of day, 0-23. */
function yangonHour(iso: string): number {
  const shifted = new Date(new Date(iso).getTime() + YANGON_OFFSET_MIN * 60_000);
  return shifted.getUTCHours();
}

/** Midnight Yangon, `daysAgo` days back, as an absolute instant. */
function yangonMidnight(daysAgo: number): Date {
  const now = new Date();
  const shifted = new Date(now.getTime() + YANGON_OFFSET_MIN * 60_000);
  shifted.setUTCHours(0, 0, 0, 0);
  shifted.setUTCDate(shifted.getUTCDate() - daysAgo);
  return new Date(shifted.getTime() - YANGON_OFFSET_MIN * 60_000);
}

export const PERIODS = ["today", "7d", "30d", "all"] as const;
export type Period = (typeof PERIODS)[number];

export function isPeriod(v: string | undefined): v is Period {
  return !!v && (PERIODS as readonly string[]).includes(v);
}

/** How many days each period spans, for the comparison window. null = all time. */
const PERIOD_DAYS: Record<Period, number | null> = {
  today: 1,
  "7d": 7,
  "30d": 30,
  all: null,
};

export interface Totals {
  revenue: number;
  sessions: number;
  playtime: number;
  snacks: number;
  avgPerSession: number;
}

export interface Bucket {
  key: string;
  label: string;
  value: number;
}

export interface ReportsData {
  ok: true;
  period: Period;
  sessions: Session[];
  staffNames: Record<string, string>;
  totals: Totals;
  /** Same-length window immediately before this one, for the trend badges. */
  previous: Totals | null;
  byDay: Bucket[];
  byHour: Bucket[];
  byStation: Bucket[];
  topSnacks: { name: string; qty: number; revenue: number }[];
  /** True when the row cap was hit, so the UI can say the figures are partial. */
  truncated: boolean;
}

export type ReportsResult = ReportsData | { ok: false; message: string };

/**
 * Aggregation happens here in TypeScript rather than in SQL. For a ten-station
 * shop that is a few thousand rows a year - well inside what one round trip
 * and a couple of reduces handle - and it avoids adding another migration for
 * someone to run. If this shop ever outgrows the cap, the fix is a SQL
 * aggregate, not a bigger cap.
 */
const ROW_CAP = 5000;

/** Rows per page on the full session-history browser. */
export const SESSION_HISTORY_PAGE_SIZE = 50;

/**
 * The column list every session read shares. Kept in one place so the reports
 * dashboard and the history browser can never drift into selecting different
 * shapes for the same `Session`.
 */
const SESSION_SELECT =
  "id,station_id,station_name,tier,rate_per_hour,minutes,charged_minutes,playtime_total,snacks_total,total,label,created_by,created_at,void_reason,voided_at,status,started_at,ended_at,payment_method,waived_minutes,order_lines(product_id,product_name,qty,unit_price,line_total)";

interface SessionRow {
  id: string;
  station_id: string | null;
  station_name: string;
  tier: Tier;
  rate_per_hour: number;
  minutes: number;
  charged_minutes: number;
  playtime_total: number;
  snacks_total: number;
  total: number;
  label: string | null;
  created_by: string;
  created_at: string;
  void_reason: string | null;
  voided_at: string | null;
  order_lines: {
    product_id: string | null;
    product_name: string;
    qty: number;
    unit_price: number;
    line_total: number;
  }[] | null;
  status: "active" | "closed";
  started_at: string | null;
  ended_at: string | null;
  payment_method: string | null;
  waived_minutes: number | null;
}

function mapSessionRow(r: SessionRow): Session {
  const orders: OrderLine[] = (r.order_lines ?? []).map((o) => ({
    productId: o.product_id ?? "",
    productName: o.product_name,
    qty: o.qty,
    unitPrice: Number(o.unit_price),
    lineTotal: Number(o.line_total),
  }));
  return {
    id: r.id,
    stationId: r.station_id ?? "",
    stationName: r.station_name,
    tier: r.tier,
    ratePerHour: Number(r.rate_per_hour),
    minutes: r.minutes,
    chargedMinutes: r.charged_minutes,
    playtimeTotal: Number(r.playtime_total),
    snacksTotal: Number(r.snacks_total),
    total: Number(r.total),
    label: r.label,
    orders,
    createdBy: r.created_by,
    createdAt: r.created_at,
    voidReason: r.void_reason,
    voidedAt: r.voided_at,
    // Reports only ever show closed rows (both readers filter on status), but
    // the type carries these so a screen that wants to say "paid by KBZPay" or
    // "50 min waived" does not need a second query for it.
    status: r.status ?? "closed",
    startedAt: r.started_at,
    endedAt: r.ended_at,
    paymentMethod: (r.payment_method as Session["paymentMethod"]) ?? null,
    waivedMinutes: r.waived_minutes ?? 0,
  };
}

/** Turn a failed `sessions` read into the message the screen should show. */
function describeSessionsError(error: {
  code?: string;
  message: string;
  details?: string | null;
  hint?: string | null;
}): string {
  console.error("[reports] sessions read failed", {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  });
  if (error.code === "PGRST106") {
    return "The `game` schema is not exposed to the API. Add it under Settings > API > Exposed schemas in the futsal Supabase project (mmyjtvlnuizpwktpkuij) and press Save.";
  }
  return `Could not load sessions (${error.code ?? "unknown"}). ${error.message}`;
}

function emptyTotals(): Totals {
  return { revenue: 0, sessions: 0, playtime: 0, snacks: 0, avgPerSession: 0 };
}

function totalsOf(rows: Session[]): Totals {
  const revenue = rows.reduce((n, s) => n + s.total, 0);
  const playtime = rows.reduce((n, s) => n + s.playtimeTotal, 0);
  const snacks = rows.reduce((n, s) => n + s.snacksTotal, 0);
  return {
    revenue,
    sessions: rows.length,
    playtime,
    snacks,
    avgPerSession: rows.length ? Math.round(revenue / rows.length) : 0,
  };
}

export async function getReports(period: Period): Promise<ReportsResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message:
        "Supabase is not configured for this deployment. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATA_SOURCE=supabase on the Vercel project myathida-game.",
    };
  }

  const supabase = await createClient();
  const days = PERIOD_DAYS[period];

  // Fetch back far enough to cover the comparison window too, so the trend
  // badges cost no extra round trip.
  const from = days === null ? null : yangonMidnight(days * 2 - 1);

  // status: a session that is still running has no total yet, and summing a
  // NULL into a day's takings makes the whole figure NULL - which reads on
  // screen as a quiet night rather than an unfinished one.
  let query = supabase
    .from("sessions")
    .select(SESSION_SELECT)
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .limit(ROW_CAP);

  if (from) query = query.gte("created_at", from.toISOString());

  const [sessionsRes, directory] = await Promise.all([query, getStaffDirectory()]);

  if (sessionsRes.error) {
    return { ok: false, message: describeSessionsError(sessionsRes.error) };
  }

  // A staff-directory failure costs names, not numbers, so it degrades to
  // showing "unknown staff" rather than failing the whole screen.
  const staffNames: Record<string, string> = {};
  for (const row of directory ?? []) staffNames[row.id] = row.name;

  const rows = (sessionsRes.data as SessionRow[] | null) ?? [];
  const all: Session[] = rows.map(mapSessionRow);

  // Split into this window and the one before it.
  const boundary = days === null ? null : yangonMidnight(days - 1);
  const current = boundary ? all.filter((s) => new Date(s.createdAt) >= boundary) : all;
  const prior = boundary ? all.filter((s) => new Date(s.createdAt) < boundary) : [];

  // ── daily buckets, including days with no sales ──────────────────────────
  // Gaps must be drawn as zero, not skipped: a bar chart that silently omits
  // the quiet days makes a bad week look like a busy one.
  const span = days ?? Math.max(1, distinctDays(current));
  const byDay: Bucket[] = [];
  for (let i = span - 1; i >= 0; i--) {
    const d = yangonMidnight(i);
    const key = yangonDay(d.toISOString());
    byDay.push({
      key,
      label: key.slice(5).replace("-", "/"),
      value: current
        .filter((s) => yangonDay(s.createdAt) === key)
        .reduce((n, s) => n + s.total, 0),
    });
  }

  // ── opening hours ────────────────────────────────────────────────────────
  // Every hour 0-23 would be mostly empty air; the shop's own range is the
  // useful window, widened a little so a late night is visible.
  const hours = current.map((s) => yangonHour(s.createdAt));
  const lo = hours.length ? Math.min(...hours) : 10;
  const hi = hours.length ? Math.max(...hours) : 23;
  const byHour: Bucket[] = [];
  for (let h = lo; h <= hi; h++) {
    byHour.push({
      key: String(h),
      label: `${String(h).padStart(2, "0")}`,
      value: current.filter((s) => yangonHour(s.createdAt) === h).reduce((n, s) => n + s.total, 0),
    });
  }

  const stationMap = new Map<string, number>();
  for (const s of current) {
    stationMap.set(s.stationName, (stationMap.get(s.stationName) ?? 0) + s.total);
  }
  const byStation: Bucket[] = [...stationMap.entries()]
    .map(([name, value]) => ({ key: name, label: name, value }))
    .sort((a, b) => b.value - a.value);

  const snackMap = new Map<string, { qty: number; revenue: number }>();
  for (const s of current) {
    for (const o of s.orders) {
      const prev = snackMap.get(o.productName) ?? { qty: 0, revenue: 0 };
      snackMap.set(o.productName, {
        qty: prev.qty + o.qty,
        revenue: prev.revenue + o.lineTotal,
      });
    }
  }
  const topSnacks = [...snackMap.entries()]
    .map(([name, v]) => ({ name, ...v }))
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 5);

  return {
    ok: true,
    period,
    sessions: current,
    staffNames,
    totals: totalsOf(current),
    previous: boundary ? totalsOf(prior) : null,
    byDay,
    byHour,
    byStation,
    topSnacks,
    truncated: rows.length >= ROW_CAP,
  };
}

function distinctDays(rows: Session[]): number {
  return new Set(rows.map((s) => yangonDay(s.createdAt))).size;
}

// ── full session-history browser ──────────────────────────────────────────────
// The reports dashboard shows a short, unfiltered tail of recent sessions. This
// backs the dedicated "all session history" screen: one page of rows at a time,
// narrowed by date range / station / staff, with an exact total so the pager
// knows how many pages there are. Filtering and paging happen in Postgres here
// rather than in TypeScript — this list is unbounded, unlike the capped
// dashboard aggregation.

export interface SessionHistoryFilters {
  from?: string; // YYYY-MM-DD, inclusive (local Yangon day)
  to?: string; // YYYY-MM-DD, inclusive (local Yangon day)
  stationId?: string;
  staff?: string; // staff id (sessions.created_by)
  page?: number; // 1-based
}

export interface SessionHistoryData {
  ok: true;
  sessions: Session[];
  staffNames: Record<string, string>;
  /** Total rows matching the filters, across all pages. */
  total: number;
  page: number;
  pageCount: number;
  pageSize: number;
  /** Option lists for the filter controls. */
  stations: { id: string; name: string }[];
  staffList: { id: string; name: string }[];
}

export type SessionHistoryResult = SessionHistoryData | { ok: false; message: string };

export async function getSessionHistory(
  filters: SessionHistoryFilters,
): Promise<SessionHistoryResult> {
  if (!isSupabaseConfigured()) {
    return {
      ok: false,
      message:
        "Supabase is not configured for this deployment. Set SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY and DATA_SOURCE=supabase on the Vercel project myathida-game.",
    };
  }

  const supabase = await createClient();
  const pageSize = SESSION_HISTORY_PAGE_SIZE;
  const page = Math.max(1, Math.floor(filters.page ?? 1));
  const offset = (page - 1) * pageSize;

  // Finished sessions only - history, not the floor. An open session would
  // appear here as a row with no duration and no total.
  let query = supabase
    .from("sessions")
    .select(SESSION_SELECT, { count: "exact" })
    .eq("status", "closed")
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const fromInstant = filters.from ? yangonDayStart(filters.from) : null;
  const toInstant = filters.to ? yangonDayStart(filters.to) : null;
  if (fromInstant) query = query.gte("created_at", fromInstant.toISOString());
  if (toInstant) {
    // `to` is an inclusive local day, so the upper bound is the start of the
    // day after it.
    const end = new Date(toInstant.getTime() + 86_400_000);
    query = query.lt("created_at", end.toISOString());
  }
  if (filters.stationId) query = query.eq("station_id", filters.stationId);
  if (filters.staff) query = query.eq("created_by", filters.staff);

  const [sessionsRes, stationsRes, directory] = await Promise.all([
    query,
    supabase.from("stations").select("id,name").order("sort_order"),
    getStaffDirectory(),
  ]);

  if (sessionsRes.error) {
    return { ok: false, message: describeSessionsError(sessionsRes.error) };
  }

  const staffNames: Record<string, string> = {};
  for (const row of directory ?? []) staffNames[row.id] = row.name;

  const sessions = ((sessionsRes.data as SessionRow[] | null) ?? []).map(mapSessionRow);
  const total = sessionsRes.count ?? sessions.length;

  return {
    ok: true,
    sessions,
    staffNames,
    total,
    page,
    pageCount: Math.max(1, Math.ceil(total / pageSize)),
    pageSize,
    stations: ((stationsRes.data as { id: string; name: string }[] | null) ?? []).filter(
      (s) => s.id && s.name,
    ),
    staffList: (directory ?? []).map((r) => ({ id: r.id, name: r.name })),
  };
}
