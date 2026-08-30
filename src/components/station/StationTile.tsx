"use client";

import { CircleDot, Circle, ClipboardList, Wrench } from "lucide-react";
import { useStore } from "@/lib/data/store";
import { useT } from "@/i18n";
import { fill } from "@/lib/ui";
import { formatMMK } from "@/lib/format";
import type { StationView } from "@/lib/types";
import { cx } from "@/lib/ui";
import { TierBadge } from "./TierBadge";

export function StationTile({ v, onRecord }: { v: StationView; onRecord: () => void }) {
  const { t } = useT();
  const { dispatch } = useStore();
  const { station, occupied, rate } = v;
  const maint = station.status === "maintenance";

  if (maint) {
    return (
      <div
        className="border border-line rounded-[10px] p-4 flex flex-col gap-3"
        style={{ background: "repeating-linear-gradient(45deg,#e7e9ed 0 11px,#eef0f3 11px 22px)" }}
      >
        <Header name={station.name} tier={station.tier} nameClass="text-text-muted" />
        <div className="flex-1 flex items-center justify-center gap-2 py-6 text-text-muted text-[12.5px] font-medium">
          <Wrench size={15} />
          {t("floor.maintenance")}
        </div>
      </div>
    );
  }

  return (
    <div
      className={cx(
        "bg-surface rounded-[10px] p-4 flex flex-col gap-3 border shadow-card",
        occupied ? "border-status-active" : "border-line",
      )}
      style={occupied ? { borderTop: "3px solid #1a9d6b" } : { borderTop: "3px solid transparent" }}
    >
      <Header name={station.name} tier={station.tier} />

      <div className="text-[13px] text-text-muted font-mono">{fill(t("floor.perHour"), { r: formatMMK(rate) })}</div>

      <button
        onClick={() => dispatch({ type: "SET_OCCUPIED", stationId: station.id, occupied: !occupied })}
        className={cx(
          "flex items-center justify-center gap-2 rounded-lg py-2 text-[13px] font-semibold border",
          occupied
            ? "bg-status-active-bg text-status-active-ink border-transparent"
            : "bg-line-faint text-text-secondary border-line-soft",
        )}
      >
        {occupied ? <CircleDot size={14} /> : <Circle size={14} />}
        {occupied ? t("floor.occupied") : t("floor.free")}
      </button>

      <button
        onClick={onRecord}
        className="flex items-center justify-center gap-2 bg-ink text-white rounded-lg py-2.5 text-[13px] font-semibold"
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
