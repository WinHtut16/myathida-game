"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Check, Gift, Inbox, Trash2, X } from "lucide-react";
import { clearHistoryAction, resolveRequestAction } from "@/app/actions/points";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useT } from "@/i18n";
import { formatDateTime } from "@/lib/format";
import { useAutoRefresh } from "@/lib/hooks/useAutoRefresh";
import type { LoyaltyRequest } from "@/lib/types";
import { cx, fill } from "@/lib/ui";

/**
 * Reward requests customers sent from /games/account. Approving deducts the
 * cost from their GAME balance (never futsal or billiards) and one from stock,
 * in one database step that re-checks balance and stock - so two staff on two
 * phones cannot approve the same points twice.
 */
export function RequestsView({
  pending,
  history,
  isOwner,
}: {
  pending: LoyaltyRequest[];
  history: LoyaltyRequest[];
  isOwner: boolean;
}) {
  const { t, locale } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [declining, setDeclining] = useState<LoyaltyRequest | null>(null);
  const [clearing, setClearing] = useState(false);
  const [, start] = useTransition();

  // A request can arrive while this screen is open.
  useAutoRefresh(30_000);

  const rewardName = (r: LoyaltyRequest) => (locale === "my" && r.reward.nameMy) || r.reward.name;

  const resolve = (r: LoyaltyRequest, action: "approve" | "reject") =>
    start(async () => {
      setBusy(r.id);
      const res = await resolveRequestAction(r.id, action);
      setBusy(null);
      setDeclining(null);
      if (!res.ok) {
        setError(res.message ?? null);
        return;
      }
      setError(null);
      toast.success(t(action === "approve" ? "pts.status.approved" : "pts.status.rejected"));
    });

  const clear = () =>
    start(async () => {
      const res = await clearHistoryAction(history.map((h) => h.id));
      setClearing(false);
      if (!res.ok) setError(res.message ?? null);
    });

  return (
    <>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <section>
        <h2 className="text-sm font-semibold text-text mb-2.5 flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-status-warn animate-pulse" />
          {t("pts.pendingTitle")}
        </h2>
        {pending.length === 0 ? (
          <EmptyState icon={Inbox} message={t("pts.noPending")} />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {pending.map((r) => {
              const short = r.customer.balance < r.pointsCost;
              return (
                <div key={r.id} className="bg-surface border border-line rounded-md p-4 flex flex-col gap-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="text-sm font-semibold truncate">{r.customer.username}</div>
                      <div className="text-xs text-text-muted tabular-nums">{r.customer.phone}</div>
                    </div>
                    <span className="text-2xs text-text-muted tabular-nums flex-none">{formatDateTime(r.requestedAt)}</span>
                  </div>
                  <div className="flex items-center gap-2.5 rounded-md bg-line-faint px-3 py-2.5">
                    <Gift size={16} className="text-accent flex-none" />
                    <span className="text-sm font-medium flex-1 min-w-0 truncate">{rewardName(r)}</span>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <dt className="text-2xs uppercase tracking-caps text-text-muted font-semibold">{t("pts.cost")}</dt>
                      <dd className="tabular-nums font-semibold">
                        {r.pointsCost.toLocaleString()} {t("pts.unit")}
                      </dd>
                    </div>
                    <div>
                      <dt className="text-2xs uppercase tracking-caps text-text-muted font-semibold">{t("pts.balance")}</dt>
                      <dd className={cx("tabular-nums font-semibold", short && "text-status-expired-ink")}>
                        {r.customer.balance.toLocaleString()} {t("pts.unit")}
                      </dd>
                    </div>
                  </dl>
                  <div className="flex gap-2">
                    <Button className="flex-1" loading={busy === r.id} disabled={busy !== null} onClick={() => resolve(r, "approve")}>
                      <Check size={15} />
                      {t("pts.approve")}
                    </Button>
                    <Button variant="secondary" disabled={busy !== null} onClick={() => setDeclining(r)}>
                      <X size={15} />
                      {t("pts.decline")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section className="bg-surface border border-line rounded-md overflow-hidden">
        <div className="flex items-center justify-between gap-3 px-5 py-3 border-b border-line-faint">
          <h2 className="text-sm font-semibold m-0">{t("pts.historyTitle")}</h2>
          {isOwner && history.length > 0 && (
            <Button variant="ghost" size="sm" onClick={() => setClearing(true)}>
              <Trash2 size={14} />
              {t("pts.clearHistory")}
            </Button>
          )}
        </div>
        {history.length === 0 ? (
          <div className="px-5 py-10 text-center text-text-muted text-sm">{t("pts.noHistory")}</div>
        ) : (
          history.map((r) => (
            <div
              key={r.id}
              className="flex flex-col gap-1 px-4 py-3 md:grid md:grid-cols-[1.4fr_1.2fr_.8fr_.9fr_1.1fr] md:items-center md:gap-3 md:px-5 border-b border-line-hair last:border-0 text-sm"
            >
              <span className="font-medium truncate">{rewardName(r)}</span>
              <span className="text-text-secondary truncate">{r.customer.username}</span>
              <span className="tabular-nums md:text-right">
                {r.pointsCost.toLocaleString()} {t("pts.unit")}
              </span>
              <span className="md:justify-self-center">
                <Badge variant={r.status === "approved" ? "success" : r.status === "rejected" ? "danger" : "neutral"}>
                  {t(`pts.status.${r.status === "pending" ? "approved" : r.status}` as const)}
                </Badge>
              </span>
              <span className="text-xs text-text-muted tabular-nums md:text-right">
                {formatDateTime(r.resolvedAt ?? r.requestedAt)}
              </span>
            </div>
          ))
        )}
      </section>

      <ConfirmDialog
        isOpen={declining !== null}
        onClose={() => setDeclining(null)}
        onConfirm={() => declining && resolve(declining, "reject")}
        title={t("pts.declineTitle")}
        message={fill(t("pts.declineMessage"), { name: declining?.customer.username ?? "" })}
        confirmLabel={t("pts.decline")}
        cancelLabel={t("common.cancel")}
        variant="warning"
        isLoading={busy !== null}
      />
      <ConfirmDialog
        isOpen={clearing}
        onClose={() => setClearing(false)}
        onConfirm={clear}
        title={t("pts.clearTitle")}
        message={fill(t("pts.clearMessage"), { n: history.length })}
        confirmLabel={t("pts.clearHistory")}
        cancelLabel={t("common.cancel")}
        variant="danger"
      />
    </>
  );
}
