import Link from "next/link";
import { TriangleAlert } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { getReports, isPeriod, type Period, type ReportsData } from "@/lib/data/reports";
import { ColumnChart, RankedBars } from "@/components/reports/charts";
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
  searchParams: Promise<{ period?: string }>;
}) {
  const params = await searchParams;
  const period: Period = isPeriod(params.period) ? params.period : "7d";
  const [data, { t }] = await Promise.all([getReports(period), getT()]);

  if (!data.ok) {
    return (
      <AppShell title={t("reports.title")}>
        <div className="p-6">
          <div className="max-w-[560px] bg-surface border border-line rounded-xl p-5 flex items-start gap-3">
            <span className="w-8 h-8 rounded-lg bg-[#fdf3f1] text-[#8a3324] flex items-center justify-center flex-none">
              <TriangleAlert size={17} />
            </span>
            <div>
              <div className="font-bold text-[15px] mb-1">{t("reports.unavailable")}</div>
              <p className="text-[13.5px] text-text-secondary leading-relaxed m-0">{data.message}</p>
            </div>
          </div>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("reports.title")} subtitle={t(LABEL_KEYS[period])} right={<PeriodTabs active={period} t={t} />}>
      <Body data={data} t={t} />
    </AppShell>
  );
}

function PeriodTabs({ active, t }: { active: Period; t: T }) {
  return (
    <div className="flex bg-line-faint border border-line-soft rounded-lg p-[3px] text-[12.5px] font-semibold">
      {(Object.keys(LABEL_KEYS) as Period[]).map((p) => (
        <Link
          key={p}
          href={`/reports?period=${p}`}
          prefetch={false}
          className={`px-3 py-1.5 rounded-md ${
            p === active ? "bg-ink text-white" : "text-text-secondary"
          }`}
        >
          {t(LABEL_KEYS[p])}
        </Link>
      ))}
    </div>
  );
}

function Body({ data, t }: { data: ReportsData; t: T }) {
  const { totals, previous, byDay, byHour, byStation, topSnacks, sessions, staffNames } = data;

  // Sparkline for the hero tile: the daily revenue already computed, tail-end.
  const spark = byDay.slice(-12).map((d) => d.value);
  const busiest = [...byHour].sort((a, b) => b.value - a.value)[0];

  return (
    <div className="p-5 px-[22px] max-w-[1180px] flex flex-col gap-4">
      {data.truncated && (
        <div className="text-[12.5px] text-status-warn-ink bg-status-warn-bg border border-[#e8d9b4] rounded-lg px-3.5 py-2.5">
          {t("reports.truncated")}
        </div>
      )}

      {/* ── headline figures ─────────────────────────────────────────────── */}
      <div className="grid grid-cols-4 gap-3">
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

      {/* ── trend + peak hours ───────────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3.5">
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
      <div className="grid grid-cols-2 gap-3.5">
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

      <SessionTable sessions={sessions} staffNames={staffNames} />
    </div>
  );
}

function Card({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-surface border border-line rounded-[11px] p-[18px]">
      <div className="flex items-baseline justify-between mb-3.5">
        <h2 className="text-[13.5px] font-bold m-0">{title}</h2>
        {note && <span className="text-[11.5px] text-text-muted font-mono">{note}</span>}
      </div>
      {children}
    </div>
  );
}
