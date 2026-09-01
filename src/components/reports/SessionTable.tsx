"use client";

import { useState } from "react";
import { Receipt, X } from "lucide-react";
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
}: {
  sessions: Session[];
  staffNames: Record<string, string>;
}) {
  const { t } = useT();
  const [receipt, setReceipt] = useState<Session | null>(null);
  const cols = "grid-cols-[1.5fr_1fr_.8fr_.9fr_.9fr_.5fr]";

  return (
    <div className="bg-surface border border-line rounded-[11px] overflow-hidden">
      <div className="flex items-baseline justify-between p-[18px] pb-3">
        <h2 className="text-[13.5px] font-bold m-0">{t("reports.history")}</h2>
        <span className="text-[11.5px] text-text-muted font-mono">
          {sessions.length} {t(sessions.length === 1 ? "reports.sessionOne" : "reports.sessionMany")}
        </span>
      </div>

      <div
        className={`grid ${cols} gap-3 px-[18px] py-2.5 border-y border-line-faint text-[10.5px] tracking-[.1em] uppercase text-text-muted font-semibold`}
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
          className={`grid ${cols} gap-3 px-[18px] py-3 border-b border-line-hair items-center text-[13.5px] last:border-0`}
        >
          <div className="min-w-0">
            <div>{formatDateTime(s.createdAt)}</div>
            <div className="text-[11.5px] text-text-muted truncate">
              {staffNames[s.createdBy] ?? t("reports.unknownStaff")}
              {s.label ? ` · ${s.label}` : ""}
            </div>
          </div>
          <span className="flex items-center gap-2 min-w-0">
            <span className="truncate">{s.stationName}</span>
            <TierBadge tier={s.tier} />
          </span>
          <span className="text-right font-mono">{formatDuration(s.minutes)}</span>
          <span className="text-right font-mono text-text-secondary">
            {s.snacksTotal ? formatMMK(s.snacksTotal) : "—"}
          </span>
          <span className="text-right font-mono font-semibold">{formatMMK(s.total)}</span>
          <button
            onClick={() => setReceipt(s)}
            className="justify-self-center text-text-muted hover:text-ink"
            aria-label={`Receipt for ${s.stationName} at ${formatDateTime(s.createdAt)}`}
          >
            <Receipt size={16} />
          </button>
        </div>
      ))}

      {receipt && <ReceiptModal session={receipt} onClose={() => setReceipt(null)} />}
    </div>
  );
}

function ReceiptModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { t } = useT();
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6"
      onClick={onClose}
    >
      <div
        className="w-[420px] max-w-full bg-surface rounded-xl shadow-modal overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-[18px] px-[22px] border-b border-line-faint">
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
