import type { Tier } from "@/lib/types";

/**
 * Station occupancy timeline: one row per station, spans of played time laid
 * out across a day. Pure and framework-free (no `server-only`) so it can be
 * unit tested directly — the Supabase read and the Yangon day-boundary maths
 * live in `src/lib/data/reports.ts`, which calls into this.
 *
 * The +06:30 Yangon offset is duplicated from `src/lib/data/yangon.ts` rather
 * than imported, because that module is `server-only` and this one must not
 * be. If the shop's timezone ever changes, both places need it.
 */
const YANGON_OFFSET_MIN = 6 * 60 + 30;
const HOUR_MS = 3_600_000;
const MIN_AXIS_SPAN_MS = 4 * HOUR_MS;

export interface TimelineStationInput {
  id: string;
  name: string;
  tier: Tier;
  sortOrder: number;
}

export interface TimelineSessionInput {
  id: string;
  stationId: string;
  stationName: string;
  tier: Tier;
  minutes: number;
  total: number;
  label: string | null;
  status: "active" | "closed";
  startedAt: string | null;
  endedAt: string | null;
  createdAt: string;
}

export interface TimelineSpan {
  id: string;
  start: number;
  end: number;
  minutes: number;
  total: number;
  label: string | null;
  /** Still running — end is "now", not a real close time. */
  live: boolean;
  /** No started_at/ended_at on the row; span is back-computed from minutes. */
  estimated: boolean;
  /** The bar was cut at the day's left edge; the real session began earlier. */
  clipped: boolean;
  /** Pre-formatted Yangon clock time, e.g. "2:00 PM". */
  startLabel: string;
  endLabel: string;
}

export interface TimelineRow {
  stationId: string;
  stationName: string;
  tier: Tier;
  spans: TimelineSpan[];
  playedMinutes: number;
}

export interface TimelineTick {
  at: number;
  label: string;
}

export interface TimelineData {
  day: string;
  isToday: boolean;
  axisStart: number;
  axisEnd: number;
  now: number;
  rows: TimelineRow[];
  ticks: TimelineTick[];
}

function floorToYangonHourMs(ms: number): number {
  const shifted = ms + YANGON_OFFSET_MIN * 60_000;
  return Math.floor(shifted / HOUR_MS) * HOUR_MS - YANGON_OFFSET_MIN * 60_000;
}

function ceilToYangonHourMs(ms: number): number {
  const shifted = ms + YANGON_OFFSET_MIN * 60_000;
  return Math.ceil(shifted / HOUR_MS) * HOUR_MS - YANGON_OFFSET_MIN * 60_000;
}

/** e.g. "2 PM", "12 AM" — for axis ticks. */
function yangonHourLabel(ms: number): string {
  const shifted = new Date(ms + YANGON_OFFSET_MIN * 60_000);
  const h = shifted.getUTCHours();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12} ${period}`;
}

/** e.g. "2:05 PM" — for span tooltips. */
function yangonClockLabel(ms: number): string {
  const shifted = new Date(ms + YANGON_OFFSET_MIN * 60_000);
  const h = shifted.getUTCHours();
  const m = shifted.getUTCMinutes();
  const period = h < 12 ? "AM" : "PM";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${String(m).padStart(2, "0")} ${period}`;
}

/** Total minutes covered by a set of spans, overlaps counted once. */
function mergedMinutes(spans: { start: number; end: number }[]): number {
  if (!spans.length) return 0;
  const sorted = [...spans].sort((a, b) => a.start - b.start);
  let total = 0;
  let curStart = sorted[0].start;
  let curEnd = sorted[0].end;
  for (let i = 1; i < sorted.length; i++) {
    const s = sorted[i];
    if (s.start <= curEnd) {
      curEnd = Math.max(curEnd, s.end);
    } else {
      total += curEnd - curStart;
      curStart = s.start;
      curEnd = s.end;
    }
  }
  total += curEnd - curStart;
  return total / 60_000;
}

function tickStepHours(axisSpanMs: number): number {
  const hours = axisSpanMs / HOUR_MS;
  if (hours <= 8) return 1;
  if (hours <= 16) return 2;
  return 3;
}

export function buildTimeline({
  day,
  dayStartMs,
  nowMs,
  isToday,
  stations,
  sessions,
}: {
  day: string;
  dayStartMs: number;
  nowMs: number;
  isToday: boolean;
  stations: TimelineStationInput[];
  sessions: TimelineSessionInput[];
}): TimelineData {
  const spansByStation = new Map<string, TimelineSpan[]>();
  const nameByStation = new Map<string, string>();
  const tierByStation = new Map<string, Tier>();

  for (const s of stations) {
    spansByStation.set(s.id, []);
    nameByStation.set(s.id, s.name);
    tierByStation.set(s.id, s.tier);
  }

  for (const session of sessions) {
    let start: number;
    let end: number;
    let live = false;
    let estimated = false;

    if (session.startedAt) {
      start = Date.parse(session.startedAt);
      live = session.status === "active";
      end = session.endedAt ? Date.parse(session.endedAt) : nowMs;
    } else {
      end = Date.parse(session.createdAt);
      start = end - session.minutes * 60_000;
      estimated = true;
    }
    if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue;

    // An estimated span is back-computed from created_at, so it can reach into
    // the previous day: two hours typed in at 00:30 starts at 22:30 yesterday.
    // The axis is fitted to the spans, so leaving that unclipped silently
    // relabels "today" as opening at 10 PM with no date anywhere on screen to
    // say otherwise. The BAR is clipped to the day; `minutes` and the clock
    // labels keep the real session, so the tooltip still tells the truth, and
    // playedMinutes now measures occupancy WITHIN the day rather than beyond it.
    const trueStart = start;
    const trueMinutes = (end - start) / 60_000;
    let clipped = false;
    if (estimated && start < dayStartMs) {
      start = dayStartMs;
      clipped = true;
      if (end <= start) continue; // recorded entirely before the day opened
    }

    const span: TimelineSpan = {
      id: session.id,
      start,
      end,
      minutes: trueMinutes,
      total: session.total,
      label: session.label,
      live,
      estimated,
      clipped,
      startLabel: yangonClockLabel(trueStart),
      endLabel: yangonClockLabel(end),
    };

    // Group by station id when known; a session on a deleted/unknown station
    // (stationId missing, or not among the current floor) groups by name
    // instead, so it still shows rather than silently vanishing.
    const key = session.stationId && spansByStation.has(session.stationId)
      ? session.stationId
      : `name:${session.stationName}`;
    if (!spansByStation.has(key)) {
      spansByStation.set(key, []);
      nameByStation.set(key, session.stationName);
      tierByStation.set(key, session.tier);
    }
    spansByStation.get(key)!.push(span);
  }

  const rows: TimelineRow[] = [];
  for (const s of stations) {
    const spans = spansByStation.get(s.id) ?? [];
    rows.push({
      stationId: s.id,
      stationName: s.name,
      tier: s.tier,
      spans: spans.sort((a, b) => a.start - b.start),
      playedMinutes: mergedMinutes(spans),
    });
  }
  // Leftover groups (unknown/deleted stations), appended after the floor, by name.
  const extraKeys = [...spansByStation.keys()]
    .filter((k) => k.startsWith("name:"))
    .sort((a, b) => a.localeCompare(b));
  for (const key of extraKeys) {
    const spans = spansByStation.get(key)!;
    rows.push({
      stationId: key,
      stationName: nameByStation.get(key) ?? key,
      tier: tierByStation.get(key) ?? "PS4",
      spans: spans.sort((a, b) => a.start - b.start),
      playedMinutes: mergedMinutes(spans),
    });
  }

  const allSpans = rows.flatMap((r) => r.spans);
  let axisStart: number;
  let axisEnd: number;
  if (allSpans.length) {
    axisStart = floorToYangonHourMs(Math.min(...allSpans.map((s) => s.start)));
    axisEnd = ceilToYangonHourMs(Math.max(...allSpans.map((s) => s.end)));
    if (axisEnd - axisStart < MIN_AXIS_SPAN_MS) axisEnd = axisStart + MIN_AXIS_SPAN_MS;
  } else {
    axisStart = dayStartMs;
    axisEnd = dayStartMs + MIN_AXIS_SPAN_MS;
  }

  const step = tickStepHours(axisEnd - axisStart) * HOUR_MS;
  const ticks: TimelineTick[] = [];
  for (let at = axisStart; at <= axisEnd; at += step) {
    ticks.push({ at, label: yangonHourLabel(at) });
  }

  return { day, isToday, axisStart, axisEnd, now: nowMs, rows, ticks };
}
