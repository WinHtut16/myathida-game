"use client";

import Link from "next/link";
import { Circle, CircleDot, Clock, ClipboardList, Play, Receipt, Wrench } from "lucide-react";
import { setStationStateAction } from "@/app/actions/floor";
import { openSessionAction } from "@/app/actions/live-session";
import { useT, type MessageKey } from "@/i18n";
import { formatMMK } from "@/lib/format";
import { useNow } from "@/lib/hooks/useNow";
import { formatElapsed, previewLiveTotal } from "@/lib/pricing";
import type { StationState, StationView } from "@/lib/types";
import { cx } from "@/lib/ui";
import { Badge } from "@/components/ui/Badge";
import { TierBadge } from "./TierBadge";

/** Tap the state chip cycles it — the common path (free -> occupied via
 * Start session) never touches this, so a one-tap skip past "reserved" is
 * an acceptable cost for the rarer manual path. */
const NEXT_STATE: Record<StationState, StationState> = {
  free: "reserved",
  reserved: "occupied",
  occupied: "free",
};

const STATE_ICON: Record<StationState, typeof Circle> = {
  free: Circle,
  reserved: Clock,
  occupied: CircleDot,
};

const STATE_VARIANT: Record<StationState, "neutral" | "warning" | "success"> = {
  free: "neutral",
  reserved: "warning",
  occupied: "success",
};

const STATE_LABEL_KEY: Record<StationState, MessageKey> = {
  free: "floor.free",
  reserved: "floor.reserved",
  occupied: "floor.occupied",
};

const STATE_ARIA_KEY: Record<StationState, MessageKey> = {
  free: "floor.markFree",
  reserved: "floor.markReserved",
  occupied: "floor.markOccupied",
};

/** Card tint per state — the whole tile carries the state, not just the chip. */
const STATE_TINT: Record<StationState, { bg: string; border: string }> = {
  free: { bg: "bg-surface", border: "var(--game-line-strong)" },
  reserved: { bg: "bg-status-warn-bg", border: "var(--game-status-warn)" },
  occupied: { bg: "bg-status-active-bg", border: "var(--game-status-active)" },
};

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
  const { station, state, rate, active, pricing } = v;
  const maint = station.status === "maintenance";

  /**
   * Occupancy is server state, so this does not flip a local value and hope.
   * The action runs, the server component re-renders with whatever the database
   * actually says, and a refusal surfaces as a message instead of a tile that
   * looks changed but is not.
   */
  const cycleState = () =>
    onPending(async () => {
      const result = await setStationStateAction(station.id, NEXT_STATE[state]);
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
          <Wrench size={16} />
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

  const StateIcon = STATE_ICON[state];
  const tint = STATE_TINT[state];

  return (
    <div
      className={cx("rounded-lg p-4 flex flex-col gap-3 border border-line-strong shadow-card", tint.bg)}
      style={{ borderTop: `4px solid ${tint.border}` }}
    >
      <Header
        name={station.name}
        tier={station.tier}
        stateBadge={
          /* The manual state survives for holding a TV busy or reserved
             without billing anyone. game.set_station_state refuses it once a
             session is running, so it can no longer contradict the timer. */
          <button
            onClick={cycleState}
            disabled={disabled}
            aria-label={t(STATE_ARIA_KEY[NEXT_STATE[state]])}
            className="-m-2 p-2 rounded-full border border-black/10 hover:bg-black/5 active:bg-black/10 transition-colors disabled:opacity-60 disabled:hover:bg-transparent"
          >
            <Badge variant={STATE_VARIANT[state]}>
              <StateIcon size={11} className="mr-1" />
              {t(STATE_LABEL_KEY[state])}
            </Badge>
          </button>
        }
      />

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
        <Play size={16} />
        {t("floor.start")}
      </button>

      {/* Retroactive entry, for the session where nobody pressed Start. */}
      <button
        onClick={onRecord}
        disabled={disabled}
        className="flex items-center justify-center gap-2 rounded-md py-2.5 text-sm font-semibold border border-line-soft bg-line-faint text-text hover:bg-line-soft disabled:opacity-60 transition-colors"
      >
        <ClipboardList size={16} />
        {t("floor.record")}
      </button>
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
        <Receipt size={16} />
        {t("floor.openSession")}
      </Link>
    </div>
  );
}

function Header({
  name,
  tier,
  nameClass = "",
  stateBadge,
}: {
  name: string;
  tier: StationView["station"]["tier"];
  nameClass?: string;
  stateBadge?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between">
      <div className="flex items-center gap-2">
        <div className={cx("text-base font-bold", nameClass)}>{name}</div>
        {stateBadge}
      </div>
      <TierBadge tier={tier} />
    </div>
  );
}
