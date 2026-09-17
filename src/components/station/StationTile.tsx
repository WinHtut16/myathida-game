"use client";

import Link from "next/link";
import { Circle, CircleDot, ClipboardList, Play, Receipt, Wrench } from "lucide-react";
import { setOccupiedAction } from "@/app/actions/floor";
import { openSessionAction } from "@/app/actions/live-session";
import { useT } from "@/i18n";
import { formatMMK } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { formatElapsed, previewLiveTotal } from "@/lib/pricing";
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
  const { station, occupied, rate, active, pricing } = v;
  const maint = station.status === "maintenance";

  /**
   * Occupancy is server state, so this does not flip a local boolean and hope.
   * The action runs, the server component re-renders with whatever the database
   * actually says, and a refusal surfaces as a message instead of a tile that
   * looks changed but is not.
   */
  const toggleOccupied = () =>
    onPending(async () => {
      const result = await setOccupiedAction(station.id, !occupied);
      if (!result.ok && result.message) onError(result.message);
    });

  const startSession = () =>
    onPending(async () => {
      const result = await openSessionAction(station.id, null);
      if (!result.ok && result.message) onError(result.message);
    });

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

  // A running session owns the tile: the timer and the running total are what
  // staff are looking at, and everything else gets out of the way.
  if (active) {
    return <RunningTile v={v} session={active} pricing={pricing} disabled={disabled} />;
  }

  return (
    <div
      className={cx(
        "rounded-lg p-4 flex flex-col gap-3 border border-line-strong shadow-card",
        occupied ? "bg-status-active-bg" : "bg-surface",
      )}
      style={{
        borderTop: occupied
          ? "4px solid var(--game-status-active)"
          : "4px solid var(--game-line-strong)",
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
        onClick={startSession}
        disabled={disabled}
        className="flex items-center justify-center gap-2 bg-accent text-white rounded-md py-2.5 text-sm font-semibold hover:bg-accent-strong disabled:opacity-60 transition-colors"
      >
        <Play size={15} />
        {t("floor.start")}
      </button>

      <div className="flex gap-2">
        {/* The manual flag survives for marking a TV busy without billing
            anyone. game.set_occupied refuses it once a session is running, so
            it can no longer contradict the timer. */}
        <button
          onClick={toggleOccupied}
          disabled={disabled}
          className={cx(
            "flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold border disabled:opacity-60 transition-colors",
            occupied
              ? "bg-surface text-status-active-ink border-status-active-bd hover:bg-status-active-bg"
              : "bg-line-faint text-text border-line-soft hover:bg-line-soft",
          )}
        >
          {occupied ? <CircleDot size={13} /> : <Circle size={13} />}
          {occupied ? t("floor.occupied") : t("floor.free")}
        </button>
        {/* Retroactive entry, for the session where nobody pressed Start. */}
        <button
          onClick={onRecord}
          disabled={disabled}
          className="flex-1 flex items-center justify-center gap-1.5 rounded-md py-2 text-xs font-semibold border border-line-soft bg-line-faint text-text hover:bg-line-soft disabled:opacity-60 transition-colors"
        >
          <ClipboardList size={13} />
          {t("floor.record")}
        </button>
      </div>
    </div>
  );
}

function RunningTile({
  v,
  session,
  pricing,
  disabled,
}: {
  v: StationView;
  session: NonNullable<StationView["active"]>;
  pricing: StationView["pricing"];
  disabled: boolean;
}) {
  const { t } = useT();
  const now = useNow();

  // Derived every tick from the server's startedAt, never accumulated locally.
  // previewLiveTotal is the same rule game.close_session() charges by, pinned
  // to it by pricing.test.ts and db-tests/97-game-live-sessions.sql.
  const bill = previewLiveTotal(session.startedAt, pricing, session.orders, now);
  const snackCount = session.orders.reduce((n, o) => n + o.qty, 0);

  return (
    <div
      className="rounded-lg p-4 flex flex-col gap-3 border border-status-active-bd shadow-card bg-status-active-bg"
      style={{ borderTop: "4px solid var(--game-status-active)" }}
    >
      <Header name={v.station.name} tier={v.station.tier} />

      <div>
        <div className="font-display text-3xl font-semibold tabular-nums tracking-tight text-text leading-none">
          {formatElapsed(bill.elapsed)}
        </div>
        <div className="text-2xs font-medium text-text-muted mt-1">
          {t("floor.billingFor")} {bill.chargedMinutes} {t("floor.minutesShort")}
        </div>
      </div>

      <div className="flex items-baseline justify-between gap-2">
        <span className="font-display text-xl font-semibold tabular-nums text-text">
          {formatMMK(bill.total)}
        </span>
        {snackCount > 0 && (
          <span className="text-2xs font-medium text-text-muted">
            +{snackCount} {t("floor.snacksShort")}
          </span>
        )}
      </div>

      <Link
        href={`/session/${session.id}`}
        aria-disabled={disabled}
        className="flex items-center justify-center gap-2 bg-accent text-white rounded-md py-2.5 text-sm font-semibold hover:bg-accent-strong transition-colors"
      >
        <Receipt size={15} />
        {t("floor.openSession")}
      </Link>
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
