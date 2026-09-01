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
          ? "rounded-[11px] p-4 px-[18px] text-[#dfe8f6]"
          : "rounded-[11px] p-4 px-[18px] bg-surface border border-line"
      }
      style={hero ? { background: "#2f5fa8" } : undefined}
    >
      <div className={hero ? "text-[12px] text-[#a9c2e5]" : "text-[12px] text-text-muted"}>
        {label}
      </div>
      <div className="flex items-baseline gap-1.5 mt-1">
        <span
          className={
            hero
              ? "font-mono text-[27px] font-bold text-white leading-none"
              : "font-mono text-[22px] font-bold leading-none"
          }
        >
          {value}
        </span>
        {unit && (
          <span className={hero ? "text-[12px] text-[#a9c2e5]" : "text-[12px] text-text-muted"}>
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
      <div className={`text-[11.5px] mt-1.5 ${hero ? "text-[#a9c2e5]" : "text-text-muted"}`}>
        {t("reports.noPrior")}
      </div>
    );
  }
  const pct = Math.round(((current - previous) / previous) * 100);
  const good = pct === 0 ? null : pct > 0 === upIsGood;
  const tone =
    good === null
      ? hero
        ? "text-[#a9c2e5]"
        : "text-text-muted"
      : good
        ? "text-status-active-ink"
        : "text-status-expired-ink";
  return (
    <div className={`text-[11.5px] mt-1.5 font-medium ${hero ? "text-[#a9c2e5]" : tone}`}>
      <span className={hero ? "text-white" : ""}>
        {pct > 0 ? "+" : ""}
        {pct}%
      </span>{" "}
      {t("reports.vsPrevious")}
    </div>
  );
}
