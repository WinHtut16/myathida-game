"use client";

import { useState, useTransition } from "react";
import { Receipt, X, TriangleAlert, Undo2 } from "lucide-react";
import { voidSessionAction } from "@/app/actions/sessions";
import { TierBadge } from "@/components/station/TierBadge";
import { formatDateTime, formatDuration, formatMMK, formatMMKUnit } from "@/lib/format";
import type { Session } from "@/lib/types";
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
}: {
  sessions: Session[];
  staffNames: Record<string, string>;
  /** Corrections zero real takings, so they stay with the owner. */
  canCorrect?: boolean;
}) {
  const { t } = useT();
  const [receipt, setReceipt] = useState<Session | null>(null);
  const cols = "md:grid-cols-[1.5fr_1fr_.8fr_.9fr_.9fr_.5fr]";

  return (
    <div className="bg-surface border border-line rounded-[11px] overflow-hidden">
      <div className="flex items-baseline justify-between p-[18px] pb-3">
        <h2 className="text-[13.5px] font-bold m-0">{t("reports.history")}</h2>
        <span className="text-[11.5px] text-text-muted font-mono">
          {sessions.length} {t(sessions.length === 1 ? "reports.sessionOne" : "reports.sessionMany")}
        </span>
      </div>

      {/* Real table from md up; below md each row collapses to a stacked
          card — see DESIGN.md's list pattern. */}
      <div
        className={`hidden md:grid ${cols} gap-3 px-[18px] py-2.5 border-y border-line-faint text-[10.5px] tracking-[.1em] uppercase text-text-muted font-semibold`}
      >
        <span>{t("reports.when")}</span>
        <span>{t("reports.station")}</span>
        <span className="text-right">{t("reports.time")}</span>
        <span className="text-right">{t("reports.snacks")}</span>
        <span className="text-right">{t("reports.total")}</span>
        <span />
      </div>

      {sessions.length === 0 && (
        <div className="px-[18px] py-10 text-center text-text-muted text-[13px]">
          {t("reports.noneRecorded")}
        </div>
      )}

      {sessions.map((s) => (
        <div
          key={s.id}
          className={`flex flex-col gap-2 px-[18px] py-3 md:grid ${cols} md:gap-3 md:items-center border-b border-line-hair text-[13.5px] last:border-0 ${
            s.voidReason ? "bg-[#fcfbf7]" : ""
          }`}
        >
          <div className="min-w-0">
            <div>{formatDateTime(s.createdAt)}</div>
            <div className="text-[11.5px] text-text-muted truncate">
              {staffNames[s.createdBy] ?? t("reports.unknownStaff")}
              {s.label ? ` · ${s.label}` : ""}
            </div>
            {s.voidReason && (
              <div className="text-[11px] text-status-warn-deep truncate mt-0.5">
                {t("reports.corrected")} · {s.voidReason}
              </div>
            )}
          </div>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{s.stationName}</span>
            <TierBadge tier={s.tier} />
          </span>
          <div className="flex items-center justify-between gap-3 md:contents">
            <span className="font-mono md:text-right">{formatDuration(s.minutes)}</span>
            <span className="font-mono text-text-secondary md:text-right">
              {s.snacksTotal ? formatMMK(s.snacksTotal) : "—"}
            </span>
            <span
              className={`font-mono font-semibold md:text-right ${
                s.voidReason ? "text-text-muted line-through" : ""
              }`}
            >
              {formatMMK(s.total)}
            </span>
            <button
              onClick={() => setReceipt(s)}
              className="justify-self-center text-text-muted hover:text-ink flex-none"
              aria-label={`Receipt for ${s.stationName} at ${formatDateTime(s.createdAt)}`}
            >
              <Receipt size={16} />
            </button>
          </div>
        </div>
      ))}

      {receipt && (
        <ReceiptModal
          session={receipt}
          canCorrect={canCorrect}
          onClose={() => setReceipt(null)}
        />
      )}
    </div>
  );
}

function ReceiptModal({
  session,
  canCorrect,
  onClose,
}: {
  session: Session;
  canCorrect: boolean;
  onClose: () => void;
}) {
  const { t } = useT();
  const [correcting, setCorrecting] = useState(false);
  const [reason, setReason] = useState("");
  const [returnSnacks, setReturnSnacks] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const r = await voidSessionAction(session.id, reason, returnSnacks);
      if (r.ok) onClose();
      else setError(r.message ?? "Could not correct the session.");
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
            <span className="text-[17px] font-bold">{session.stationName}</span>
            <TierBadge tier={session.tier} />
          </div>
          <button onClick={onClose} className="text-text-muted" aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </div>
        <div className="p-[22px] flex flex-col gap-3">
          <div className="text-[12.5px] text-text-muted">{formatDateTime(session.createdAt)}</div>
          <Row
            label={`${t("reports.playtime")} · ${formatDuration(session.minutes)} · ${formatMMK(session.ratePerHour)}/hr`}
            value={formatMMK(session.playtimeTotal)}
          />
          {session.chargedMinutes !== session.minutes && (
            <div className="text-[11.5px] text-text-muted -mt-1.5">
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
          <div className="mx-[22px] mb-4 flex items-start gap-2.5 rounded-lg border border-[#e8d9b4] bg-status-warn-bg px-3.5 py-2.5 text-[12.5px] text-status-warn-ink">
            <TriangleAlert size={15} className="mt-px flex-none" />
            <div>
              <strong className="font-semibold">{t("reports.corrected")}.</strong>{" "}
              {session.voidReason}
            </div>
          </div>
        )}

        {correcting && (
          <div className="mx-[22px] mb-4 rounded-lg border border-line bg-[#fafbfc] p-3.5">
            {error && (
              <div className="mb-2.5 text-[12.5px] text-[#8a3324]">{error}</div>
            )}
            <label className="block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold mb-1.5">
              {t("reports.correctReason")}
            </label>
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reports.correctReasonHint")}
              disabled={pending}
              className="cat-input"
            />
            {session.orders.length > 0 && (
              <label className="flex items-start gap-2 mt-3 text-[12.5px] text-text-secondary">
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
                disabled={pending || !reason.trim()}
                className="bg-status-expired text-white rounded-lg px-4 py-2 text-[13px] font-semibold disabled:opacity-45"
              >
                {pending ? t("record.saving") : t("reports.correctConfirm")}
              </button>
              <button
                onClick={() => setCorrecting(false)}
                disabled={pending}
                className="text-[13px] text-text-secondary font-semibold"
              >
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {canCorrect && !session.voidReason && !correcting && (
          <div className="px-[22px] pb-4">
            <button
              onClick={() => setCorrecting(true)}
              className="inline-flex items-center gap-1.5 text-[12.5px] font-semibold text-status-expired-ink hover:underline"
            >
              <Undo2 size={14} />
              {t("reports.correct")}
            </button>
          </div>
        )}

        <div className="bg-ink p-4 px-[22px] flex items-center justify-between">
          <span className="text-[#c7cbd3] text-[13px] uppercase tracking-[.12em]">{t("reports.total")}</span>
          <span className="text-white font-mono text-[22px] font-bold">
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
      <span className="font-mono flex-none">{value}</span>
    </div>
  );
}
