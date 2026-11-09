"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Gift, Pencil, Plus, Power, Trash2 } from "lucide-react";
import { deleteRewardAction, setRewardActiveAction } from "@/app/actions/points";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { useT } from "@/i18n";
import type { LoyaltyReward } from "@/lib/types";
import { cx, fill } from "@/lib/ui";

/**
 * The shop's rewards. Any staff member can switch one on or off (out of the
 * item for the day); only an owner adds, edits or deletes - the database
 * refuses anyone else, the hidden buttons are only a courtesy.
 */
export function RewardsView({ rewards, isOwner }: { rewards: LoyaltyReward[]; isOwner: boolean }) {
  const { t, locale } = useT();
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<LoyaltyReward | null>(null);
  const [, start] = useTransition();

  const name = (r: LoyaltyReward) => (locale === "my" && r.nameMy) || r.name;
  const desc = (r: LoyaltyReward) => (locale === "my" && r.descriptionMy) || r.description;

  const toggle = (r: LoyaltyReward) =>
    start(async () => {
      setBusy(r.id);
      const res = await setRewardActiveAction(r.id, !r.isActive);
      setBusy(null);
      setError(res.ok ? null : (res.message ?? null));
    });

  const remove = () =>
    start(async () => {
      if (!deleting) return;
      setBusy(deleting.id);
      const res = await deleteRewardAction(deleting.id);
      setBusy(null);
      setDeleting(null);
      setError(res.ok ? null : (res.message ?? null));
    });

  const sections = [
    { key: "pts.on" as const, items: rewards.filter((r) => r.isActive) },
    { key: "pts.off" as const, items: rewards.filter((r) => !r.isActive) },
  ].filter((s) => s.items.length > 0);

  return (
    <>
      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-text-muted m-0">{isOwner ? "" : t("pts.ownerOnly")}</p>
        {isOwner && (
          <Link
            href="/points/rewards/new"
            className="inline-flex items-center gap-1.5 bg-accent text-white rounded-md px-3.5 py-2 text-sm font-semibold hover:bg-accent-strong transition-colors"
          >
            <Plus size={15} />
            {t("pts.newReward")}
          </Link>
        )}
      </div>

      {sections.length === 0 ? (
        <EmptyState icon={Gift} message={t("pts.noRewards")} />
      ) : (
        sections.map((s) => (
          <section key={s.key}>
            <h2 className="text-2xs uppercase tracking-caps text-text-muted font-semibold mb-2">{t(s.key)}</h2>
            <div className="bg-surface border border-line rounded-md overflow-hidden">
              {s.items.map((r) => (
                <div
                  key={r.id}
                  className={cx(
                    "flex flex-wrap items-center gap-3 px-4 py-3.5 md:px-5 border-b border-line-hair last:border-0",
                    !r.isActive && "opacity-60",
                  )}
                >
                  <span className="w-9 h-9 rounded-md bg-accent-soft text-accent flex items-center justify-center flex-none">
                    <Gift size={17} />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-semibold truncate">{name(r)}</div>
                    {desc(r) && <div className="text-xs text-text-muted truncate">{desc(r)}</div>}
                  </div>
                  <div className="flex items-center gap-2 flex-none">
                    <Badge variant="warning">
                      {r.pointsCost.toLocaleString()} {t("pts.unit")}
                    </Badge>
                    <span className="text-xs text-text-muted tabular-nums w-[84px] text-right">
                      {r.stock === null ? t("pts.unlimited") : fill(t("pts.stockLeft"), { n: r.stock })}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 flex-none">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => toggle(r)}
                      loading={busy === r.id}
                      disabled={busy !== null}
                      aria-label={r.isActive ? t("pts.off") : t("pts.on")}
                      title={r.isActive ? t("pts.off") : t("pts.on")}
                    >
                      <Power size={15} className={r.isActive ? "text-status-active-ink" : "text-text-muted"} />
                    </Button>
                    {isOwner && (
                      <>
                        <Link
                          href={`/points/rewards/${r.id}`}
                          aria-label={t("pts.edit")}
                          title={t("pts.edit")}
                          className="p-2 rounded-md text-text-secondary hover:bg-line-faint"
                        >
                          <Pencil size={15} />
                        </Link>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setDeleting(r)}
                          disabled={busy !== null}
                          aria-label={t("pts.delete")}
                          title={t("pts.delete")}
                        >
                          <Trash2 size={15} className="text-status-expired-ink" />
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </section>
        ))
      )}

      <ConfirmDialog
        isOpen={deleting !== null}
        onClose={() => setDeleting(null)}
        onConfirm={remove}
        title={t("pts.deleteTitle")}
        message={fill(t("pts.deleteMessage"), { name: deleting ? name(deleting) : "" })}
        confirmLabel={t("pts.delete")}
        cancelLabel={t("common.cancel")}
        variant="danger"
        isLoading={busy !== null}
      />
    </>
  );
}
