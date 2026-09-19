"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Receipt, X, TriangleAlert, Undo2, ArrowRight } from "lucide-react";
import { correctSessionAction, voidSessionAction } from "@/app/actions/sessions";
import { TierBadge } from "@/components/station/TierBadge";
import { formatDateTime, formatDuration, formatMMK, formatMMKUnit } from "@/lib/format";
import type { Pricing, Session } from "@/lib/types";
import { previewCorrection } from "@/lib/pricing";
import { useT } from "@/i18n";
import { fill } from "@/lib/ui";

/**
 * The session history table and its receipt modal.
 *
 * The only client component on this screen, and only because the receipt is a
 * modal. The rows themselves are plain markup handed down from the server.
 */
export function SessionTable({
  sessions,
  staffNames,
  canCorrect = false,
  scroll = true,
  viewAllHref,
  emptyLabel,
  total,
  pricing = [],
}: {
  sessions: Session[];
  staffNames: Record<string, string>;
  /** Rate card for the correction preview. Empty = no preview, never a crash. */
  pricing?: Pricing[];
  /** Corrections zero real takings, so they stay with the owner. */
  canCorrect?: boolean;
  /** Cap the body height and let it scroll — the dashboard's short tail.
      The full-history page owns its own paging, so it turns this off. */
  scroll?: boolean;
  /** When set, a link to the full session-history screen sits in the header. */
  viewAllHref?: string;
  /** Overrides the "nothing recorded" line (e.g. "no rows match the filters"). */
  emptyLabel?: string;
  /**
   * Count shown in the header. Defaults to `sessions.length`, which is right
   * when `sessions` IS the whole list (the full-history page's current page).
   * The dashboard passes only a short tail of a larger window, so it passes
   * the window's real total here - otherwise the header would understate how
   * many sessions the period actually had.
   */
  total?: number;
}) {
  const { t } = useT();
  const [receipt, setReceipt] = useState<Session | null>(null);
  const cols = "md:grid-cols-[1.5fr_1fr_.8fr_.9fr_.9fr_.5fr]";
  const count = total ?? sessions.length;

  return (
    <div className="bg-surface border border-line rounded-lg overflow-hidden">
      <div className="flex items-baseline justify-between gap-3 p-[18px] pb-3">
        <h2 className="text-sm font-bold m-0">{t("reports.history")}</h2>
        <div className="flex items-baseline gap-3">
          <span className="text-2xs text-text-muted tabular-nums">
            {count} {t(count === 1 ? "reports.sessionOne" : "reports.sessionMany")}
          </span>
          {viewAllHref && (
            <Link
              href={viewAllHref}
              prefetch={false}
              className="inline-flex items-center gap-1 text-2xs font-semibold text-accent hover:underline whitespace-nowrap"
            >
              {t("reports.viewAll")}
              <ArrowRight size={12} />
            </Link>
          )}
        </div>
      </div>

      {/* Real table from md up; below md each row collapses to a stacked
          card — see DESIGN.md's list pattern. The body scrolls when `scroll`
          is on, with the column head pinned so it stays readable. */}
      <div className={scroll ? "max-h-[62vh] overflow-y-auto" : undefined}>
        <div
          className={`hidden md:grid ${cols} gap-3 px-[18px] py-2.5 border-y border-line-faint text-2xs tracking-caps uppercase text-text-muted font-semibold ${
            scroll ? "sticky top-0 z-10 bg-surface" : ""
          }`}
        >
          <span>{t("reports.when")}</span>
          <span>{t("reports.station")}</span>
          <span className="text-right">{t("reports.time")}</span>
          <span className="text-right">{t("reports.snacks")}</span>
          <span className="text-right">{t("reports.total")}</span>
          <span />
        </div>

        {sessions.length === 0 && (
          <div className="px-[18px] py-10 text-center text-text-muted text-sm">
            {emptyLabel ?? t("reports.noneRecorded")}
          </div>
        )}

        {sessions.map((s) => (
        <div
          key={s.id}
          className={`flex flex-col gap-2 px-[18px] py-3 md:grid ${cols} md:gap-3 md:items-center border-b border-line-hair text-sm last:border-0 ${
            s.voidReason ? "bg-surface-sunken" : ""
          }`}
        >
          <div className="min-w-0">
            <div>{formatDateTime(s.createdAt)}</div>
            <div className="text-2xs text-text-muted truncate">
              {staffNames[s.createdBy] ?? t("reports.unknownStaff")}
              {s.label ? ` · ${s.label}` : ""}
            </div>
            {s.voidReason && (
              <div className="text-2xs text-status-warn-deep truncate mt-0.5">
                {t("reports.corrected")} · {s.voidReason}
              </div>
            )}
          </div>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{s.stationName}</span>
            <TierBadge tier={s.tier} />
          </span>
          <div className="flex items-center justify-between gap-3 md:contents">
            <span className="tabular-nums md:text-right">{formatDuration(s.minutes)}</span>
            <span className="tabular-nums text-text-secondary md:text-right">
              {s.snacksTotal ? formatMMK(s.snacksTotal) : "—"}
            </span>
            <span
              className={`tabular-nums font-semibold md:text-right ${
                s.voidReason ? "text-text-muted line-through" : ""
              }`}
            >
              {formatMMK(s.total)}
            </span>
            <button
              onClick={() => setReceipt(s)}
              className="justify-self-center text-text-muted hover:text-accent flex-none"
              aria-label={`Receipt for ${s.stationName} at ${formatDateTime(s.createdAt)}`}
            >
              <Receipt size={16} />
            </button>
          </div>
        </div>
        ))}
      </div>

      {receipt && (
        <ReceiptModal
          session={receipt}
          canCorrect={canCorrect}
          pricing={pricing}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

function ReceiptModal({
  session,
  canCorrect,
  pricing,
  onClose,
}: {
  session: Session;
  pricing: Pricing[];
  canCorrect: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  // Two different repairs, and they must not be one mis-click apart. "fix"
  // re-prices the session and keeps the day it was taken on. "cancel" writes
  // the whole sale off and is terminal.
  const [mode, setMode] = useState<"fix" | "cancel" | null>(null);
  const [minutes, setMinutes] = useState(String(session.minutes));
  const [reason, setReason] = useState("");
  const [returnSnacks, setReturnSnacks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const typedMinutes = Number(minutes);
  const minutesValid = Number.isInteger(typedMinutes) && typedMinutes > 0;
  const canSubmit = reason.trim().length > 0 && (mode === "cancel" || minutesValid);

  // The server re-derives all of this; the preview only exists so the owner
  // sees the number before committing. `find` rather than rateFor(): an empty
  // rate card must show NO preview, not silently price everything as tier one.
  const tier = pricing.find((p) => p.tier === session.tier) ?? null;
  const preview =
    mode === "fix" && minutesValid && tier
      ? previewCorrection(typedMinutes, tier, session.ratePerHour, session.snacksTotal)
      : null;

  const open = (next: "fix" | "cancel") => {
    setMode(next);
    setError(null);
    setReason("");
    setMinutes(String(session.minutes));
  };

  const submit = () =>
    startTransition(async () => {
      const r =
        mode === "fix"
          ? await correctSessionAction(session.id, typedMinutes, reason)
          : await voidSessionAction(session.id, reason, returnSnacks);
      if (r.ok) onClose();
      else setError(r.message ?? "Could not change the session.");
    });
  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-3 sm:p-6"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-w-full max-h-[90vh] overflow-y-auto bg-surface rounded-xl shadow-modal"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 sm:p-[18px] px-4 sm:px-[22px] border-b border-line-faint">
          <div className="flex items-center gap-2">
            <span className="text-lg font-bold">{session.stationName}</span>
            <TierBadge tier={session.tier} />
          </div>
          <button onClick={onClose} className="text-text-muted hover:text-text" aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="p-[22px] flex flex-col gap-3">
          <div className="text-xs text-text-muted">{formatDateTime(session.createdAt)}</div>
          <Row
            label={`${t("reports.playtime")} · ${formatDuration(session.minutes)} · ${formatMMK(session.ratePerHour)}/hr`}
            value={formatMMK(session.playtimeTotal)}
          />
          {session.chargedMinutes !== session.minutes && (
            <div className="text-2xs text-text-muted -mt-1.5">
              {fill(t("reports.chargedAs"), { m: formatDuration(session.chargedMinutes) })}
            </div>
          )}
          {session.orders.map((o) => (
            <Row
              key={o.productId || o.productName}
              label={`${o.qty} × ${o.productName}`}
              value={formatMMK(o.lineTotal)}
              muted
            />
          ))}
        </div>
        {session.voidReason && (
          <div className="mx-[22px] mb-4 flex items-start gap-2.5 rounded-md border border-status-warn-bd bg-status-warn-bg px-3.5 py-2.5 text-xs text-status-warn-ink">
            <TriangleAlert size={15} className="mt-px flex-none" />
            <div>
              <strong className="font-semibold">{t("reports.corrected")}.</strong>{" "}
              {session.voidReason}
            </div>
          </div>
        )}

        {session.correctedAt && session.originalTotal !== null && (
          <div className="mx-[22px] mb-4 rounded-md border border-line bg-surface-sunken px-3.5 py-2.5 text-xs text-text-secondary">
            <strong className="font-semibold text-text">{t("reports.corrected")}.</strong>{" "}
            {fill(t("reports.correctedFrom"), {
              m: formatDuration(session.originalChargedMinutes ?? 0),
              v: formatMMK(session.originalTotal),
            })}
            {session.correctionReason ? ` · ${session.correctionReason}` : ""}
          </div>
        )}

        {mode && (
          <div className="mx-[22px] mb-4 rounded-md border border-line bg-surface-sunken p-3.5">
            {error && (
              <div className="mb-2.5 text-xs text-status-expired-ink">{error}</div>
            )}
            {mode === "fix" && (
              <>
                <label className="block text-2xs tracking-caps uppercase text-text-muted font-semibold mb-1.5">
                  {t("reports.correctMinutes")}
                </label>
                <input
                  autoFocus
                  type="number"
                  min={1}
                  step={1}
                  inputMode="numeric"
                  value={minutes}
                  onChange={(e) => setMinutes(e.target.value)}
                  disabled={pending}
                  className="cat-input"
                />
                {/* The charge is re-derived on the server from this number and
                    the tier's blocks, exactly as the timer does it. Saying so
                    stops anyone expecting the typed minutes to be the price. */}
                <div className="text-2xs text-text-muted mt-1.5 mb-2.5">
                  {t("reports.correctMinutesHint")}
                </div>
                {preview && (
                  <div className="mb-3 flex items-center justify-between gap-3 rounded-md border border-line-soft bg-surface px-3 py-2 text-xs">
                    <span className="text-text-secondary">
                      {fill(t("reports.correctPreview"), {
                        m: formatDuration(preview.chargedMinutes),
                      })}
                    </span>
                    <span className="tabular-nums font-semibold flex-none">
                      <span className="text-text-muted line-through">
                        {formatMMK(session.total)}
                      </span>{" "}
                      <ArrowRight size={11} className="inline -mt-px" />{" "}
                      {formatMMK(preview.total)}
                    </span>
                  </div>
                )}
              </>
            )}
            <label className="block text-2xs tracking-caps uppercase text-text-muted font-semibold mb-1.5">
              {mode === "fix" ? t("reports.correctReason") : t("reports.cancelReason")}
            </label>
            <input
              autoFocus={mode === "cancel"}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={
                mode === "fix" ? t("reports.correctReasonHint") : t("reports.cancelReasonHint")
              }
              disabled={pending}
              className="cat-input"
            />
            {mode === "cancel" && (
              <div className="text-2xs text-status-expired-ink mt-1.5">
                {t("reports.cancelNote")}
              </div>
            )}
            {mode === "cancel" && session.orders.length > 0 && (
              <label className="flex items-start gap-2 mt-3 text-xs text-text-secondary">
                <input
                  type="checkbox"
                  checked={returnSnacks}
                  onChange={(e) => setReturnSnacks(e.target.checked)}
                  disabled={pending}
                  className="mt-0.5"
                />
                {/*
                  Off by default: the usual correction is a mistyped duration,
                  where the customer really did drink the Coke. Returning it
                  every time would quietly inflate the shelf count.
                */}
                <span>{t("reports.returnSnacks")}</span>
              </label>
            )}
            <div className="flex items-center gap-2 mt-3.5">
              <button
                onClick={submit}
                disabled={pending || !canSubmit}
                className={`${
                  mode === "fix" ? "bg-accent" : "bg-status-expired"
                } text-white rounded-md px-4 py-2 text-sm font-semibold disabled:opacity-45`}
              >
                {pending
                  ? t("record.saving")
                  : mode === "fix"
                    ? t("reports.correctConfirm")
                    : t("reports.cancelConfirm")}
              </button>
              <button
                onClick={() => setMode(null)}
                disabled={pending}
                className="text-sm text-text-secondary font-semibold"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {canCorrect && !session.voidReason && !mode && (
          <div className="px-[22px] pb-4 flex items-center gap-4">
            <button
              onClick={() => open("fix")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-accent hover:underline"
            >
              <Undo2 size={14} />
              {t("reports.correct")}
            </button>
            <button
              onClick={() => open("cancel")}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-status-expired-ink hover:underline"
            >
              {t("reports.cancelSession")}
            </button>
          </div>
        )}

        <div className="bg-ink p-4 px-[22px] flex items-center justify-between">
          <span className="text-rail-text text-sm uppercase tracking-caps">{t("reports.total")}</span>
          <span className="text-white font-display text-2xl font-bold tabular-nums tracking-tight">
            {formatMMKUnit(session.total)}
          </span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm gap-4">
      <span className={muted ? "text-text-secondary" : ""}>{label}</span>
      <span className="tabular-nums flex-none">{value}</span>
    </div>
  );
}
