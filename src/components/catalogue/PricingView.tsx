"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Plus, Trash2 } from "lucide-react";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { updatePricingAction } from "@/app/actions/catalogue";
import { TierBadge } from "@/components/station/TierBadge";
import { useT, type MessageKey } from "@/i18n";
import { formatMMK } from "@/lib/format";
import type { Pricing, PricingTier } from "@/lib/types";

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

const byDuration = (a: PricingTier, b: PricingTier) => a.durationMinutes - b.durationMinutes;

/** Mirrors updatePricingAction's own checks, so Save disables before a round trip. */
function tiersError(tiers: PricingTier[], t: (k: MessageKey) => string): string | null {
  if (tiers.length === 0) return t("pricing.sixtyRequired");
  for (const tier of tiers) {
    if (!Number.isInteger(tier.durationMinutes) || tier.durationMinutes <= 0) {
      return t("pricing.invalidDuration");
    }
    if (!Number.isFinite(tier.rate) || tier.rate < 0) {
      return t("pricing.invalidPrice");
    }
  }
  const durations = tiers.map((d) => d.durationMinutes);
  if (new Set(durations).size !== durations.length) return t("pricing.duplicateDuration");
  if (!durations.includes(60)) return t("pricing.sixtyRequired");
  return null;
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
  const [tiers, setTiers] = useState<PricingTier[]>([...pricing.tiers].sort(byDuration));
  const [draft, setDraft] = useState({
    minMinutes: pricing.minMinutes,
    incrementMinutes: pricing.incrementMinutes,
    graceMinutes: pricing.graceMinutes,
  });

  const sortedOriginal = [...pricing.tiers].sort(byDuration);
  const dirty =
    JSON.stringify(tiers) !== JSON.stringify(sortedOriginal) ||
    draft.minMinutes !== pricing.minMinutes ||
    draft.incrementMinutes !== pricing.incrementMinutes ||
    draft.graceMinutes !== pricing.graceMinutes;

  const error = tiersError(tiers, t);
  const sixtyRate = tiers.find((d) => d.durationMinutes === 60)?.rate ?? 0;

  const setTier = (i: number, patch: Partial<PricingTier>) =>
    setTiers((list) => list.map((d, idx) => (idx === i ? { ...d, ...patch } : d)));
  const addTier = () => setTiers((list) => [...list, { durationMinutes: 0, rate: 0 }]);
  const removeTier = (i: number) => setTiers((list) => list.filter((_, idx) => idx !== i));

  const save = () =>
    startTransition(async () => {
      const r = await updatePricingAction(
        pricing.tier,
        [...tiers].sort(byDuration),
        draft.minMinutes,
        draft.incrementMinutes,
        draft.graceMinutes,
      );
      if (r.ok) {
        onError(null);
        toast.success(t("pricing.saved"));
      } else {
        onError(r.message ?? "Could not save.");
      }
    });

  const rows: { key: keyof typeof draft; label: string; sub?: string }[] = [
    { key: "minMinutes", label: t("pricing.minMinutes"), sub: t("pricing.minMinutesSub") },
    { key: "incrementMinutes", label: t("pricing.increment") },
    { key: "graceMinutes", label: t("pricing.grace") },
  ];

  return (
    <div className="bg-surface border border-line rounded-md p-6">
      <div className="flex items-center gap-2.5 mb-5">
        <TierBadge tier={pricing.tier} />
        <span className="text-md font-bold">{t("pricing.rateCard")}</span>
      </div>

      <div className="flex flex-col gap-2.5 mb-4">
        <div className="text-sm font-semibold">{t("pricing.tierPrice")}</div>
        {tiers.map((tier, i) => (
          <div key={i} className="flex items-center gap-2">
            <input
              type="number"
              min={1}
              value={tier.durationMinutes}
              disabled={!canEdit || pending || tier.durationMinutes === 60}
              onChange={(e) => setTier(i, { durationMinutes: Number(e.target.value) || 0 })}
              className="border border-line rounded-md px-2.5 py-2 font-display text-sm font-semibold tabular-nums tracking-tight w-[72px] text-right outline-none disabled:bg-surface-sunken disabled:text-text-muted"
            />
            <span className="text-xs text-text-muted">{t("pricing.duration")}</span>
            <input
              type="number"
              min={0}
              value={tier.rate}
              disabled={!canEdit || pending}
              onChange={(e) => setTier(i, { rate: Number(e.target.value) || 0 })}
              className="border border-line rounded-md px-3 py-2 font-display text-sm font-semibold tabular-nums tracking-tight w-[100px] text-right outline-none disabled:bg-surface-sunken disabled:text-text-muted ml-auto"
            />
            <button
              type="button"
              onClick={() => removeTier(i)}
              disabled={!canEdit || pending || tier.durationMinutes === 60}
              title={t("pricing.removeTier")}
              className="p-2 text-text-muted hover:text-danger disabled:opacity-30 disabled:hover:text-text-muted"
            >
              <Trash2 className="size-3.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={addTier}
          disabled={!canEdit || pending}
          className="flex items-center gap-1.5 text-xs font-semibold text-accent hover:text-accent-strong disabled:opacity-45 mt-1"
        >
          <Plus className="size-3.5" />
          {t("pricing.addTier")}
        </button>
        {error && <div className="text-2xs text-danger mt-0.5">{error}</div>}
      </div>

      <div className="flex flex-col gap-4">
        {rows.map((r) => (
          <div key={r.key} className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="text-sm font-semibold">{r.label}</div>
              {r.sub && <div className="text-xs text-text-muted">{r.sub}</div>}
            </div>
            <input
              type="number"
              min={0}
              value={draft[r.key]}
              disabled={!canEdit || pending}
              onChange={(e) =>
                setDraft((d) => ({ ...d, [r.key]: Number(e.target.value) || 0 }))
              }
              className="border border-line rounded-md px-3.5 py-2.5 font-display text-md font-semibold tabular-nums tracking-tight w-[120px] text-right outline-none disabled:bg-surface-sunken disabled:text-text-muted"
            />
          </div>
        ))}
      </div>

      <div className="mt-3.5 text-2xs text-text-muted leading-relaxed">
        {t("pricing.futureOnly")}
      </div>

      <button
        onClick={save}
        disabled={!canEdit || pending || !dirty || !!error}
        className="w-full mt-4 bg-accent text-white rounded-md hover:bg-accent-strong transition-colors py-3 text-sm font-semibold disabled:opacity-45"
      >
        {pending ? t("record.saving") : `${t("pricing.save")} · ${formatMMK(sixtyRate)}/hr`}
      </button>
    </div>
  );
}
