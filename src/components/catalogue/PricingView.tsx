"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { updatePricingAction } from "@/app/actions/catalogue";
import { TierBadge } from "@/components/station/TierBadge";
import { useT } from "@/i18n";
import { formatMMK } from "@/lib/format";
import type { Pricing } from "@/lib/types";

/**
 * Rate cards.
 *
 * A price change here affects only FUTURE sessions. record_session snapshots
 * rate_per_hour onto every row it writes, so nothing already charged is
 * rewritten - which is why a receipt in Reports still shows what the customer
 * actually paid after a price rise. The note under each card says so, because
 * "will this change yesterday's takings?" is a fair thing for an owner to
 * worry about before touching it.
 */
export function PricingView({ pricing, canEdit }: { pricing: Pricing[]; canEdit: boolean }) {
  const { t } = useT();
  const [error, setError] = useState<string | null>(null);

  return (
    <>
      {error && (
        <ErrorBanner message={error} onDismiss={() => setError(null)} className="mx-4 sm:mx-5 mt-4" />
      )}
      <div className="p-4 sm:p-5 px-4 sm:px-[22px] grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 max-w-[1100px]">
        {pricing.map((p) => (
          <RateCard key={p.tier} pricing={p} canEdit={canEdit} onError={setError} />
        ))}
      </div>
    </>
  );
}

function RateCard({
  pricing,
  canEdit,
  onError,
}: {
  pricing: Pricing;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState({
    ratePerHour: pricing.ratePerHour,
    minMinutes: pricing.minMinutes,
  });

  const dirty =
    draft.ratePerHour !== pricing.ratePerHour || draft.minMinutes !== pricing.minMinutes;

  const save = () =>
    startTransition(async () => {
      const r = await updatePricingAction(pricing.tier, draft.ratePerHour, draft.minMinutes);
      if (r.ok) {
        onError(null);
        toast.success(t("pricing.saved"));
      } else {
        onError(r.message ?? "Could not save.");
      }
    });

  const rows: { key: keyof typeof draft; label: string; sub: string }[] = [
    { key: "ratePerHour", label: t("pricing.ratePerHour"), sub: t("pricing.ratePerHourSub") },
    { key: "minMinutes", label: t("pricing.minMinutes"), sub: t("pricing.minMinutesSub") },
  ];

  return (
    <div className="bg-surface border border-line rounded-[10px] p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <TierBadge tier={pricing.tier} />
        <span className="text-[15px] font-bold">{t("pricing.rateCard")}</span>
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-xs text-text-muted">{r.sub}</div>
            </div>
            <input
              type="number"
              min={0}
              value={draft[r.key]}
              disabled={!canEdit || pending}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [r.key]: Number(e.target.value) || 0 }))
              }
              className="border border-line rounded-lg px-3.5 py-2.5 font-mono text-[15px] font-semibold w-[120px] text-right outline-none disabled:bg-[#f7f8fa] disabled:text-text-muted"
            />
          </div>
        ))}
      </div>

      <div className="mt-3.5 text-[11.5px] text-text-muted leading-relaxed">
        {t("pricing.futureOnly")}
      </div>

      <button
        onClick={save}
        disabled={!canEdit || pending || !dirty}
        className="w-full mt-4 bg-ink text-white rounded-lg py-3 text-sm font-semibold disabled:opacity-45"
      >
        {pending
          ? t("record.saving")
          : `${t("pricing.save")} · ${formatMMK(draft.ratePerHour)}/hr`}
      </button>
    </div>
  );
}
