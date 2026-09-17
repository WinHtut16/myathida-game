import type { Bucket } from "@/lib/data/reports";
import type { TimelineData } from "@/lib/timeline";
import { formatDuration, formatMMK } from "@/lib/format";
import type { MessageKey } from "@/i18n";

type T = (k: MessageKey) => string;

/**
 * Charts as server-rendered SVG. No charting library, and no client JS at all.
 *
 * Futsal and billiards both use Recharts, and copying that here was the
 * obvious move. It is the wrong one for this app: Recharts is ~150KB of
 * JavaScript that has to arrive, parse and hydrate before a single bar
 * appears, on a shop's connection in Yangon, to draw four static bar charts
 * that never animate and never get clicked. Everything below renders on the
 * server and paints with the HTML.
 *
 * Every chart here is a SINGLE series, which is why no legend appears: there
 * is one colour, and the heading already says what it is. Hover text comes
 * from <title>, which the browser shows natively - no tooltip runtime.
 *
 * Mark spec: bars capped at 24px so the band keeps its air, 4px rounded at the
 * data end and square at the baseline, a 2px surface gap between neighbours,
 * and hairline recessive axes.
 */

/** Chart ink rides the palette: the brand blue for the active mark, its soft
 * tint for the recessive one. Both resolve from globals.css --game-* so the
 * charts move with the rest of the app instead of pinning two more hex
 * literals here. */
const MARK = "var(--game-accent)";
const MARK_QUIET = "var(--game-accent-soft)";
const AXIS = "var(--game-line-soft)";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

export function EmptyPlot({ label }: { label: string }) {
  return (
    <div className="h-[132px] flex items-center justify-center text-sm text-text-muted">
      {label}
    </div>
  );
}

/**
 * Vertical columns for a value over time or across hours.
 * `highlightLast` picks out today in the trend, which is the bar people look
 * for first.
 */
export function ColumnChart({
  data,
  emptyLabel,
  highlightLast = false,
  unit = "MMK",
}: {
  data: Bucket[];
  emptyLabel: string;
  highlightLast?: boolean;
  unit?: string;
}) {
  const total = data.reduce((n, d) => n + d.value, 0);
  if (!data.length || total === 0) return <EmptyPlot label={emptyLabel} />;

  const max = niceMax(Math.max(...data.map((d) => d.value)));
  const H = 132;
  const PLOT = 108;
  const GAP = 2;
  const slot = 100 / data.length;

  return (
    <div>
      <svg
        viewBox={`0 0 100 ${H}`}
        preserveAspectRatio="none"
        className="w-full"
        style={{ height: H }}
        role="img"
        aria-label={`${data.length} buckets, maximum ${formatMMK(max)} ${unit}`}
      >
        {/* recessive baseline; gridlines omitted because values are labelled */}
        <line x1="0" y1={PLOT} x2="100" y2={PLOT} stroke={AXIS} strokeWidth="1"
              vectorEffect="non-scaling-stroke" />
        {data.map((d, i) => {
          const h = d.value === 0 ? 0 : Math.max(2, (d.value / max) * (PLOT - 4));
          const w = Math.max(0.5, slot - GAP);
          const x = i * slot + GAP / 2;
          const last = highlightLast && i === data.length - 1;
          return (
            <g key={d.key}>
              <title>{`${d.label} — ${formatMMK(d.value)} ${unit}`}</title>
              {/* full-slot hit area so hover works on the empty days too */}
              <rect x={i * slot} y="0" width={slot} height={PLOT} fill="transparent" />
              {h > 0 && (
                <rect
                  x={x}
                  y={PLOT - h}
                  width={w}
                  height={h}
                  rx="1.5"
                  fill={last ? MARK : MARK_QUIET}
                />
              )}
            </g>
          );
        })}
      </svg>
      <div className="flex mt-1.5">
        {data.map((d, i) => (
          <div
            key={d.key}
            className="text-2xs text-text-muted text-center tabular-nums"
            style={{ width: `${slot}%` }}
          >
            {/* thin out labels so they never collide */}
            {data.length <= 12 || i % Math.ceil(data.length / 10) === 0 ? d.label : ""}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * Horizontal ranked bars. Used where the category name matters as much as the
 * value (which TV earns, which snack sells), because names read far better
 * along a row than rotated under a column.
 */
export function RankedBars({
  data,
  emptyLabel,
  format = (n: number) => formatMMK(n),
  max: explicitMax,
}: {
  data: { key: string; label: string; value: number; note?: string }[];
  emptyLabel: string;
  format?: (n: number) => string;
  max?: number;
}) {
  if (!data.length || data.every((d) => d.value === 0)) return <EmptyPlot label={emptyLabel} />;
  const max = explicitMax ?? Math.max(...data.map((d) => d.value));

  return (
    <div className="flex flex-col gap-2.5">
      {data.map((d) => {
        const pct = max > 0 ? Math.max(1.5, (d.value / max) * 100) : 0;
        return (
          <div key={d.key} className="flex items-center gap-3" title={`${d.label} — ${format(d.value)}`}>
            <div className="w-[106px] flex-none text-xs text-text-secondary truncate">
              {d.label}
            </div>
            <div className="flex-1 h-[18px] bg-line-faint rounded-sm overflow-hidden">
              <div
                className="h-full rounded-r-sm"
                style={{ width: `${pct}%`, background: MARK }}
              />
            </div>
            <div className="w-[104px] flex-none text-right tabular-nums text-xs font-semibold">
              {format(d.value)}
              {d.note && <span className="text-text-muted font-normal"> {d.note}</span>}
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** 12-point sparkline for a stat tile. Current period in the accent. */
export function Sparkline({ values }: { values: number[] }) {
  const max = Math.max(...values, 1);
  return (
    <div className="flex items-end gap-[2px] h-6 mt-2" aria-hidden="true">
      {values.map((v, i) => (
        <div
          key={i}
          className="flex-1 rounded-sm"
          style={{
            height: `${Math.max(6, (v / max) * 100)}%`,
            background: i === values.length - 1 ? MARK : MARK_QUIET,
          }}
        />
      ))}
    </div>
  );
}

/**
 * Station occupancy timeline: a Gantt-style row per station, played spans laid
 * out across the axis returned by `buildTimeline`. Same server-rendered-HTML
 * approach as the charts above — the position math is done once on the
 * server (percentages against axisStart/axisEnd), so no client JS runs here
 * either.
 */
export function StationTimeline({ data, t }: { data: TimelineData; t: T }) {
  const { rows, axisStart, axisEnd, ticks, now, isToday } = data;
  const span = axisEnd - axisStart;
  const pct = (ms: number) => `${(Math.min(Math.max(ms, axisStart), axisEnd) - axisStart) / span * 100}%`;

  const hasAnySpan = rows.some((r) => r.spans.length > 0);
  if (!hasAnySpan) return <EmptyPlot label={t("reports.timelineEmpty")} />;

  const nowPct = isToday && now >= axisStart && now <= axisEnd ? pct(now) : null;

  return (
    <div>
      <div className="flex flex-col gap-2">
        {rows.map((row) => (
          <div key={row.stationId} className="flex items-center gap-3">
            <div className="w-[64px] sm:w-[106px] flex-none text-xs text-text-secondary truncate">
              {row.stationName}
            </div>
            <div className="relative flex-1 h-[22px] bg-line-faint rounded-sm overflow-hidden">
              {ticks.map((tick) => (
                <div
                  key={tick.at}
                  className="absolute top-0 bottom-0 w-px bg-line"
                  style={{ left: pct(tick.at) }}
                />
              ))}
              {row.spans.map((s) => (
                <div
                  key={s.id}
                  title={spanTooltip(s, t)}
                  className="absolute top-0 bottom-0 rounded-sm"
                  style={{
                    left: pct(s.start),
                    width: `calc(${pct(s.end)} - ${pct(s.start)})`,
                    background: s.estimated
                      ? "repeating-linear-gradient(45deg, var(--game-status-active) 0, var(--game-status-active) 4px, var(--game-status-active-bg) 4px, var(--game-status-active-bg) 8px)"
                      : "var(--game-status-active)",
                    minWidth: 2,
                  }}
                />
              ))}
              {nowPct && (
                <div
                  className="absolute top-0 bottom-0 w-px bg-status-expired"
                  style={{ left: nowPct }}
                />
              )}
            </div>
            <div className="w-[64px] sm:w-[84px] flex-none text-right tabular-nums text-xs font-semibold">
              {row.playedMinutes > 0 ? formatDuration(row.playedMinutes) : "—"}
            </div>
          </div>
        ))}
      </div>
      {/* Positioned with the same pct() the gridlines above use, NOT with flex.
          Even flex distribution only agrees with the gridlines when the axis
          span is an exact multiple of the tick step, and tickStepHours returns
          2h for anything from 9 to 16 hours - so a 9-hour day drew 5 ticks over
          8 hours and put the last label 11% to the right of its own line. One
          source of truth for horizontal position is the only version that
          cannot drift apart again. */}
      <div className="relative h-4 mt-1.5 ml-[76px] sm:ml-[118px] mr-[76px] sm:mr-[96px]">
        {ticks.map((tick) => (
          <span
            key={tick.at}
            className="absolute text-2xs text-text-muted tabular-nums -translate-x-1/2 whitespace-nowrap"
            style={{ left: pct(tick.at) }}
          >
            {tick.label}
          </span>
        ))}
      </div>
      <div className="flex items-center gap-4 mt-4 text-2xs text-text-muted">
        <LegendSwatch style={{ background: "var(--game-status-active)" }} label={t("reports.timelinePlayed")} />
        <LegendSwatch
          style={{
            background:
              "repeating-linear-gradient(45deg, var(--game-status-active) 0, var(--game-status-active) 3px, var(--game-status-active-bg) 3px, var(--game-status-active-bg) 6px)",
          }}
          label={t("reports.timelineEstimated")}
        />
        <LegendSwatch style={{ background: "var(--game-line-faint)" }} label={t("reports.timelineFree")} />
      </div>
    </div>
  );
}

function spanTooltip(
  s: TimelineData["rows"][number]["spans"][number],
  t: T,
): string {
  const parts = [`${s.startLabel} – ${s.endLabel}`, formatDuration(s.minutes)];
  if (s.total > 0) parts.push(`${formatMMK(s.total)} MMK`);
  if (s.estimated) parts.push(t("reports.timelineEstimated"));
  if (s.clipped) parts.push(t("reports.timelineClipped"));
  if (s.live) parts.push(t("reports.timelineLive"));
  return parts.join(" · ");
}

function LegendSwatch({ style, label }: { style: React.CSSProperties; label: string }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="w-3 h-3 rounded-sm flex-none" style={style} />
      {label}
    </span>
  );
}
