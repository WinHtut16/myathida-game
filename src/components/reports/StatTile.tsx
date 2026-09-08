import { Sparkline } from "./charts";
import type { MessageKey } from "@/i18n";

type T = (k: MessageKey) => string;

/**
 * Stat tile: label, value, optional delta against the previous window, and an
 * optional sparkline. `tone="hero"` fills the tile for the one figure the
 * screen leads with - exactly one per view.
 */
export function StatTile({
  t,
  label,
  value,
  unit,
  current,
  previous,
  spark,
  tone = "plain",
  upIsGood = true,
}: {
  t: T;
  label: string;
  value: string;
  unit?: string;
  current?: number;
  previous?: number | null;
  spark?: number[];
  tone?: "plain" | "hero";
  upIsGood?: boolean;
}) {
  const hero = tone === "hero";
  return (
    <div
      className={
        hero
          ? "rounded-lg p-4 px-[18px] bg-accent text-white shadow-card"
          : "rounded-lg p-4 px-[18px] bg-surface border border-line"
      }
    >
      <div className={hero ? "text-xs text-white/75" : "text-xs text-text-muted"}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={
            hero
              ? "font-display text-3xl font-bold text-white leading-none tabular-nums tracking-tight"
              : "font-display text-2xl font-bold leading-none tabular-nums tracking-tight"
          }
        >
          {value}
        </span>
        {unit && (
          <span className={hero ? "text-xs text-white/75" : "text-xs text-text-muted"}>
            {unit}
          </span>
        )}
      </div>
      {current !== undefined && previous !== undefined && previous !== null && (
        <Delta t={t} current={current} previous={previous} upIsGood={upIsGood} hero={hero} />
      )}
      {spark && spark.length > 1 && <Sparkline values={spark} />}
    </div>
  );
}

/**
 * Signed change against the previous window of the same length.
 *
 * Deliberately shows nothing rather than a percentage when the previous window
 * was zero: "+100%" against no trading is not information, and a first week of
 * business would be covered in meaningless green.
 */
function Delta({
  t,
  current,
  previous,
  upIsGood,
  hero,
}: {
  t: T;
  current: number;
  previous: number;
  upIsGood: boolean;
  hero: boolean;
}) {
  if (previous === 0) {
    return (
      <div className={`text-2xs mt-1.5 ${hero ? "text-white/75" : "text-text-muted"}`}>
        {t("reports.noPrior")}
      </div>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const good = pct === 0 ? null : pct > 0 === upIsGood;
  // The hero tile previously forced every delta to one flat tint, so the one
  // number the screen leads with never showed whether its change was good or
  // bad. It keeps its signal now — brighter greens/reds that hold up on the
  // accent background.
  const tone =
    good === null
      ? hero
        ? "text-white/75"
        : "text-text-muted"
      : good
        ? hero
          ? "text-status-active-bg"
          : "text-status-active-ink"
        : hero
          ? "text-status-expired-bd"
          : "text-status-expired-ink";
  return (
    <div className={`text-2xs mt-1.5 font-semibold ${tone}`}>
      {pct > 0 ? "+" : ""}
      {pct}% {t("reports.vsPrevious")}
    </div>
  );
}
