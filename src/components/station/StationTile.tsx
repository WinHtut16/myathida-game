"use client";

import { CircleDot, Circle, ClipboardList, Wrench } from "lucide-react";
import { setOccupiedAction } from "@/app/actions/floor";
import { useT } from "@/i18n";
import { formatMMK } from "@/lib/format";
import type { StationView } from "@/lib/types";
import { cx } from "@/lib/ui";
import { TierBadge } from "./TierBadge";

export function StationTile({
  v,
  onRecord,
  onError,
  onPending,
  disabled = false,
}: {
  v: StationView;
  onRecord: () => void;
  onError: (message: string) => void;
  /** Wraps the action so React keeps the old UI on screen until the refresh lands. */
  onPending: (fn: () => void) => void;
  disabled?: boolean;
}) {
  const { t } = useT();
  const { station, occupied, rate } = v;

  /**
   * Occupancy is server state now, so this does not flip a local boolean and
   * hope. The action runs, the server component re-renders with whatever the
   * database actually says, and a refusal surfaces as a message instead of a
   * tile that looks changed but is not.
   */
  const toggleOccupied = () =>
    onPending(async () => {
      const result = await setOccupiedAction(station.id, !occupied);
      if (!result.ok && result.message) onError(result.message);
    });
  const maint = station.status === "maintenance";

  if (maint) {
    return (
      <div
        className="rounded-lg p-4 flex flex-col gap-3 border border-status-warn-bd shadow-card"
        style={{
          borderTop: "4px solid var(--game-status-warn)",
          background:
            "repeating-linear-gradient(45deg, var(--game-status-warn-bg) 0 11px, var(--color-surface) 11px 22px)",
        }}
      >
        <Header name={station.name} tier={station.tier} nameClass="text-text-muted" />
        <div className="flex-1 flex items-center justify-center gap-2 py-6 text-status-warn-deep text-xs font-semibold">
          <Wrench size={15} />
          {t("floor.maintenance")}
        </div>
      </div>
    );
  }

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3 border border-line bg-surface shadow-card"
      style={{
        borderTop: occupied
          ? "4px solid var(--game-status-active)"
          : "4px solid var(--game-line)",
      }}
    >
      <Header name={station.name} tier={station.tier} />

      <div className="flex items-baseline gap-1">
        <span className="font-display text-xl font-semibold tabular-nums tracking-tight text-text">
          {formatMMK(rate)}
        </span>
        <span className="text-2xs font-medium text-text-muted">/{t("floor.hourUnit")}</span>
      </div>

      <button
        onClick={toggleOccupied}
        disabled={disabled}
        className={cx(
          "flex items-center justify-center gap-2 rounded-md py-2 text-sm font-semibold border disabled:opacity-60 transition-colors",
          occupied
            ? "bg-status-active-ink text-white border-transparent"
            : "bg-surface text-text-secondary border-line hover:border-line-strong",
        )}
      >
        {occupied ? <CircleDot size={14} /> : <Circle size={14} />}
        {occupied ? t("floor.occupied") : t("floor.free")}
      </button>

      <button
        onClick={onRecord}
        className="flex items-center justify-center gap-2 bg-accent text-white rounded-md py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors"
      >
        <ClipboardList size={15} />
        {t("floor.record")}
      </button>
    </div>
  );
}

function Header({ name, tier, nameClass = "" }: { name: string; tier: StationView["station"]["tier"]; nameClass?: string }) {
  return (
    <div className="flex items-start justify-between">
      <div className={cx("text-base font-bold", nameClass)}>{name}</div>
      <TierBadge tier={tier} />
    </div>
  );
}
