"use client";

import { useState } from "react";
import { Receipt, X } from "lucide-react";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/lib/data/store";
import { useT } from "@/i18n";
import { formatDateTime, formatDuration, formatMMK, formatMMKUnit } from "@/lib/format";
import { TierBadge } from "@/components/station/TierBadge";
import type { Session } from "@/lib/types";

export default function HistoryPage() {
  const { t } = useT();
  const { history, state } = useStore();
  const [receipt, setReceipt] = useState<Session | null>(null);

  const today = new Date().toDateString();
  const todays = history.filter((s) => new Date(s.createdAt).toDateString() === today);
  const revenue = todays.reduce((sum, s) => sum + s.total, 0);

  const topSnacks = Object.values(
    history
      .flatMap((s) => s.orders)
      .reduce<Record<string, { name: string; qty: number }>>((acc, o) => {
        acc[o.productName] = acc[o.productName] ?? { name: o.productName, qty: 0 };
        acc[o.productName].qty += o.qty;
        return acc;
      }, {}),
  )
    .sort((a, b) => b.qty - a.qty)
    .slice(0, 3);

  const userName = (id: string) => state.staff.find((u) => u.id === id)?.name ?? "—";

  return (
    <AppShell title={t("history.title")}>
      <div className="p-5 px-[22px] max-w-[1100px] flex flex-col gap-4">
        {/* KPIs */}
        <div className="grid grid-cols-3 gap-3.5">
          <Kpi label={t("history.today")} value={`${todays.length}`} sub={t("history.sessions")} />
          <Kpi label={t("history.revenue")} value={formatMMK(revenue)} sub="MMK" />
          <div className="border border-line-faint rounded-[9px] p-4 bg-[#fafbfc]">
            <div className="text-[11.5px] text-text-muted mb-2">{t("history.topSnacks")}</div>
            <div className="flex flex-col gap-1">
              {topSnacks.length === 0 && <span className="text-[13px] text-text-muted">—</span>}
              {topSnacks.map((s, i) => (
                <div key={s.name} className="flex justify-between text-[12.5px]">
                  <span>
                    {i + 1}. {s.name}
                  </span>
                  <span className="font-mono">{s.qty}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* history table */}
        <div className="bg-surface border border-line rounded-[10px] overflow-hidden">
          <div className="grid grid-cols-[1.4fr_1fr_1fr_1fr_.8fr_.6fr] gap-3 p-3 px-5 border-b border-line-faint text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold">
            <span>{t("history.when")}</span>
            <span>{t("history.tv")}</span>
            <span className="text-right">{t("history.duration")}</span>
            <span className="text-right">{t("history.snacks")}</span>
            <span className="text-right">{t("history.total")}</span>
            <span />
          </div>
          {history.length === 0 && <div className="p-6 text-text-muted text-sm">{t("history.none")}</div>}
          {history.map((s) => (
            <div key={s.id} className="grid grid-cols-[1.4fr_1fr_1fr_1fr_.8fr_.6fr] gap-3 p-3.5 px-5 border-b border-line-hair items-center text-sm">
              <div>
                <div>{formatDateTime(s.createdAt)}</div>
                <div className="text-[11.5px] text-text-muted">
                  {t("history.by")} {userName(s.createdBy)}
                  {s.label ? ` · ${s.label}` : ""}
                </div>
              </div>
              <span className="flex items-center gap-2">
                {s.stationName} <TierBadge tier={s.tier} />
              </span>
              <span className="text-right font-mono">{formatDuration(s.minutes)}</span>
              <span className="text-right font-mono text-text-secondary">{s.snacksTotal ? formatMMK(s.snacksTotal) : "—"}</span>
              <span className="text-right font-mono font-semibold">{formatMMK(s.total)}</span>
              <button onClick={() => setReceipt(s)} className="justify-self-center text-text-muted" aria-label="receipt">
                <Receipt size={16} />
              </button>
            </div>
          ))}
        </div>
      </div>

      {receipt && <ReceiptModal session={receipt} onClose={() => setReceipt(null)} />}
    </AppShell>
  );
}

function Kpi({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <div className="border border-line-faint rounded-[9px] p-4 bg-[#fafbfc]">
      <div className="text-[11.5px] text-text-muted mb-2">{label}</div>
      <div className="font-mono text-[23px] font-bold">
        {value} <span className="text-[13px] text-text-muted">{sub}</span>
      </div>
    </div>
  );
}

function ReceiptModal({ session, onClose }: { session: Session; onClose: () => void }) {
  const { t } = useT();
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-6" onClick={onClose}>
      <div className="w-[420px] max-w-full bg-surface rounded-xl shadow-modal overflow-hidden" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between p-[18px] px-[22px] border-b border-line-faint">
          <div className="flex items-center gap-2">
            <span className="text-[17px] font-bold">{session.stationName}</span>
            <TierBadge tier={session.tier} />
          </div>
          <button onClick={onClose} className="text-text-muted">
            <X size={18} />
          </button>
        </div>
        <div className="p-[22px] flex flex-col gap-3">
          <div className="text-[12.5px] text-text-muted">{formatDateTime(session.createdAt)}</div>
          <Row label={`${t("history.duration")} · ${formatDuration(session.minutes)}`} value={formatMMK(session.playtimeTotal)} />
          {session.orders.map((o) => (
            <Row key={o.productId} label={`${o.qty} × ${o.productName}`} value={formatMMK(o.lineTotal)} muted />
          ))}
        </div>
        <div className="bg-ink p-4 px-[22px] flex items-center justify-between">
          <span className="text-[#c7cbd3] text-[13px] uppercase tracking-[.12em]">{t("history.total")}</span>
          <span className="text-white font-mono text-[22px] font-bold">{formatMMKUnit(session.total)}</span>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value, muted = false }: { label: string; value: string; muted?: boolean }) {
  return (
    <div className="flex justify-between text-sm">
      <span className={muted ? "text-text-secondary" : ""}>{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
