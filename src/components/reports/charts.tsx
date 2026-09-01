import type { Bucket } from "@/lib/data/reports";
import { formatMMK } from "@/lib/format";

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

/** Validated against the app surface: passes lightness, chroma and 3:1 contrast. */
const MARK = "#3b73c4";
const MARK_QUIET = "#c3d4ec";

function niceMax(v: number): number {
  if (v <= 0) return 1;
  const mag = 10 ** Math.floor(Math.log10(v));
  return Math.ceil(v / mag) * mag;
}

export function EmptyPlot({ label }: { label: string }) {
  return (
    <div className="h-[132px] flex items-center justify-center text-[13px] text-text-muted">
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
        <line x1="0" y1={PLOT} x2="100" y2={PLOT} stroke="#e0e3e8" strokeWidth="1"
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
            className="text-[10px] text-text-muted text-center font-mono"
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
            <div className="w-[106px] flex-none text-[12.5px] text-text-secondary truncate">
              {d.label}
            </div>
            <div className="flex-1 h-[18px] bg-line-faint rounded-[3px] overflow-hidden">
              <div
                className="h-full rounded-r-[4px]"
                style={{ width: `${pct}%`, background: MARK }}
              />
            </div>
            <div className="w-[104px] flex-none text-right font-mono text-[12.5px] font-semibold">
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
