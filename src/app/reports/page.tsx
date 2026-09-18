import Link from "next/link";
import { TriangleAlert, ChevronLeft, ChevronRight } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getReports, getStationTimeline, isPeriod, RECENT_TAIL, type Period, type ReportsData, type StationTimelineResult } from "@/lib/data/reports";
import { yangonDay } from "@/lib/data/yangon";
import { getCurrentUser } from "@/lib/data/session";
import { ColumnChart, RankedBars, StationTimeline } from "@/components/reports/charts";
import { StatTile } from "@/components/reports/StatTile";
import { SessionTable } from "@/components/reports/SessionTable";
import { formatMMK } from "@/lib/format";
import { getT } from "@/i18n/server";
import type { MessageKey } from "@/i18n";

/**
 * Reports: a SERVER component reading the real `game` schema.
 *
 * The period filter is a set of links driving ?period=, not client state.
 * That keeps the whole screen server-rendered - each choice is a fresh render
 * with fresh figures, it survives a reload, and it can be bookmarked or sent
 * to the owner as a URL. No client JS is spent on a four-item filter.
 */
export const dynamic = "force-dynamic";

const LABEL_KEYS: Record<Period, MessageKey> = {
  today: "reports.today",
  "7d": "reports.d7",
  "30d": "reports.d30",
  all: "reports.all",
};

type T = (k: MessageKey) => string;

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ period?: string; day?: string }>;
}) {
  const params = await searchParams;
  const period: Period = isPeriod(params.period) ? params.period : "7d";
  const today = yangonDay(new Date().toISOString());
  const day = isValidDay(params.day) && params.day! <= today ? params.day! : today;

  const [data, timeline, { t }, user] = await Promise.all([
    getReports(period),
    getStationTimeline(day),
    getT(),
    getCurrentUser(),
  ]);

  if (!data.ok) {
    return (
      <AppShell title={t("reports.title")}>
        <div className="p-6">
          <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-status-expired-bg text-status-expired-ink flex items-center justify-center flex-none">
              <TriangleAlert size={17} />
            </span>
            <div>
              <div className="font-bold text-md mb-1">{t("reports.unavailable")}</div>
              <p className="text-sm text-text-secondary leading-relaxed m-0">{data.message}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("reports.title")} subtitle={t(LABEL_KEYS[period])} right={<PeriodTabs active={period} day={day} t={t} />}>
      <Body data={data} timeline={timeline} period={period} day={day} today={today} t={t} canCorrect={user?.isSuperadmin ?? false} />
    </AppShell>
  );
}

/**
 * Shape is not enough. "2026-01-99" passes a regex and also passes `<= today`
 * as a string compare, and then shiftDay() throws RangeError on
 * `new Date(NaN).toISOString()` - a 500 on the whole page, from a URL. Dates
 * like "2026-02-31" are worse: V8 rolls them into March and the page quietly
 * charts the wrong day. Round-tripping catches both, which is the same standard
 * yangonDayStart() in lib/data/yangon.ts already holds itself to.
 */
function isValidDay(v: string | undefined): v is string {
  if (!v || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const ms = Date.parse(`${v}T00:00:00.000Z`);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 10) === v;
}

/** "YYYY-MM-DD" +/- one calendar day. Pure string math, no timezone involved. */
function shiftDay(day: string, deltaDays: number): string {
  const ms = Date.parse(`${day}T00:00:00Z`) + deltaDays * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

function formatDayLabel(day: string): string {
  return new Date(`${day}T00:00:00Z`).toLocaleDateString("en-US", {
    timeZone: "UTC",
    day: "numeric",
    month: "short",
  });
}

function DaySwitcher({ period, day, today, t }: { period: Period; day: string; today: string; t: T }) {
  const prev = shiftDay(day, -1);
  const next = shiftDay(day, 1);
  const nextDisabled = day >= today;
  return (
    <span className="flex items-center gap-1">
      <Link
        href={`/reports?period=${period}&day=${prev}`}
        prefetch={false}
        aria-label={t("reports.prevDay")}
        className="w-6 h-6 flex items-center justify-center rounded hover:bg-line-faint"
      >
        <ChevronLeft size={14} />
      </Link>
      <span className="w-16 text-center">{day === today ? t("reports.today") : formatDayLabel(day)}</span>
      {nextDisabled ? (
        <span className="w-6 h-6 flex items-center justify-center text-text-faint">
          <ChevronRight size={14} />
        </span>
      ) : (
        <Link
          href={`/reports?period=${period}&day=${next}`}
          prefetch={false}
          aria-label={t("reports.nextDay")}
          className="w-6 h-6 flex items-center justify-center rounded hover:bg-line-faint"
        >
          <ChevronRight size={14} />
        </Link>
      )}
    </span>
  );
}

function PeriodTabs({ active, day, t }: { active: Period; day: string; t: T }) {
  return (
    <div className="flex bg-line-faint border border-line-soft rounded-md p-[3px] text-xs font-semibold">
      {(Object.keys(LABEL_KEYS) as Period[]).map((p) => (
        <Link
          key={p}
          href={`/reports?period=${p}&day=${day}`}
          prefetch={false}
          className={`px-2 sm:px-3 py-1.5 rounded-md whitespace-nowrap ${
            p === active ? "bg-accent text-white" : "text-text-secondary"
          }`}
        >
          {t(LABEL_KEYS[p])}
        </Link>
      ))}
    </div>
  );
}

function Body({
  data,
  timeline,
  period,
  day,
  today,
  t,
  canCorrect,
}: {
  data: ReportsData;
  timeline: StationTimelineResult;
  period: Period;
  day: string;
  today: string;
  t: T;
  canCorrect: boolean;
}) {
  const { totals, previous, byDay, byHour, byStation, topSnacks, sessions, staffNames } = data;

  // Sparkline for the hero tile: the daily revenue already computed, tail-end.
  const spark = byDay.slice(-12).map((d) => d.value);
  const busiest = [...byHour].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="p-4 sm:p-5 px-4 sm:px-[22px] max-w-[1180px] flex flex-col gap-4">
      {data.truncated && (
        <div className="text-xs text-status-warn-ink bg-status-warn-bg border border-status-warn-bd rounded-lg px-3.5 py-2.5">
          {t("reports.truncated")}
        </div>
      )}

      {/* ── headline figures ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatTile
          t={t}
          tone="hero"
          label={t("reports.revenue")}
          value={formatMMK(totals.revenue)}
          unit="MMK"
          current={totals.revenue}
          previous={previous?.revenue ?? null}
          spark={spark}
        />
        <StatTile
          t={t}
          label={t("reports.sessions")}
          value={String(totals.sessions)}
          current={totals.sessions}
          previous={previous?.sessions ?? null}
        />
        <StatTile
          t={t}
          label={t("reports.avgPerSession")}
          value={formatMMK(totals.avgPerSession)}
          unit="MMK"
          current={totals.avgPerSession}
          previous={previous?.avgPerSession ?? null}
        />
        <StatTile
          t={t}
          label={t("reports.snacksDrinks")}
          value={formatMMK(totals.snacks)}
          unit="MMK"
          current={totals.snacks}
          previous={previous?.snacks ?? null}
        />
      </div>

      {/* ── station occupancy timeline ───────────────────────────────────── */}
      <Card title={t("reports.timeline")} note={<DaySwitcher period={period} day={day} today={today} t={t} />}>
        {timeline.ok ? (
          <StationTimeline data={timeline.data} t={t} />
        ) : (
          <p className="text-sm text-text-secondary m-0">{timeline.message}</p>
        )}
      </Card>

      {/* ── trend + peak hours ───────────────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card
          title={t("reports.byDay")}
          note={byDay.length > 1 ? `${byDay.length} ${t("reports.days")}` : undefined}
        >
          <ColumnChart data={byDay} emptyLabel={t("reports.noSessions")} highlightLast />
        </Card>
        <Card
          title={t("reports.byHour")}
          note={busiest && busiest.value > 0 ? `${t("reports.peak")} ${busiest.label}:00` : undefined}
        >
          <ColumnChart data={byHour} emptyLabel={t("reports.noSessions")} />
        </Card>
      </div>

      {/* ── where the money comes from ───────────────────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3.5">
        <Card title={t("reports.byStation")}>
          <RankedBars data={byStation} emptyLabel={t("reports.noSessions")} />
        </Card>
        <Card title={t("reports.topSnacks")}>
          <RankedBars
            data={topSnacks.map((s) => ({
              key: s.name,
              label: s.name,
              value: s.qty,
              note: `· ${formatMMK(s.revenue)}`,
            }))}
            emptyLabel={t("reports.noSnacks")}
            format={(n) => `${n}`}
          />
        </Card>
      </div>

      <SessionTable
        sessions={sessions.slice(0, RECENT_TAIL)}
        total={totals.sessions}
        staffNames={staffNames}
        canCorrect={canCorrect}
        viewAllHref="/reports/sessions"
      />
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded-lg p-[18px]">
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-sm font-bold m-0">{title}</h2>
        {note && <span className="text-2xs text-text-muted tabular-nums">{note}</span>}
      </div>
      {children}
    </div>
  );
}
