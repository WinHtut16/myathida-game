"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { setPointRuleAction, setTierPointsAction } from "@/app/actions/catalogue";
import { TierBadge } from "@/components/station/TierBadge";
import { useT } from "@/i18n";
import type { PointRule, Tier } from "@/lib/types";

/**
 * The game shop's points: per FULL hour of paid time, by tier
 * (game.pricing.points_per_hour), plus the shop-wide on/off switch
 * (public.point_rules 'game'). Part hours earn nothing.
 *
 * Shown to every admin (staff answer "how many points do I get?" at the
 * counter); only an owner can change it, and the database enforces that, not
 * this component. A change applies only to sessions that earn from now on -
 * each session freezes the rule it first earned under.
 *
 * tierPoints=null: game-tier-points-migration.sql has not run yet, so the old
 * single rule (N points per block of M minutes) is edited instead.
 */
export function PointsRuleCard({
  rule,
  tiers,
  tierPoints,
  canEdit,
  onError,
}: {
  rule: PointRule | null;
  tiers: Tier[];
  tierPoints: Partial<Record<Tier, number>> | null;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const base = rule ?? { blockMinutes: 60, pointsPerBlock: 10, isActive: false };
  const [draft, setDraft] = useState<PointRule>(base);
  const [draftTiers, setDraftTiers] = useState<Partial<Record<Tier, number>>>(tierPoints ?? {});

  const perTier = tierPoints !== null;
  const changedTiers = perTier ? tiers.filter((tier) => (draftTiers[tier] ?? 0) !== (tierPoints[tier] ?? 0)) : [];
  const ruleDirty =
    !rule ||
    draft.isActive !== rule.isActive ||
    (!perTier && (draft.blockMinutes !== rule.blockMinutes || draft.pointsPerBlock !== rule.pointsPerBlock));
  const dirty = ruleDirty || changedTiers.length > 0;

  const invalid = perTier
    ? tiers.some((tier) => {
        const n = draftTiers[tier] ?? 0;
        return !Number.isInteger(n) || n < 0 || n > 100000;
      })
    : !Number.isInteger(draft.blockMinutes) || draft.blockMinutes < 1 || draft.blockMinutes > 1440 ||
      !Number.isInteger(draft.pointsPerBlock) || draft.pointsPerBlock < 0;

  const save = () =>
    startTransition(async () => {
      for (const tier of changedTiers) {
        const r = await setTierPointsAction(tier, draftTiers[tier] ?? 0);
        if (!r.ok) {
          onError(r.message ?? "Could not save.");
          return;
        }
      }
      if (ruleDirty) {
        // Per-tier mode: block/points of the shop rule are no longer used for
        // new sessions; keep them as they are and only flip the switch.
        const r = await setPointRuleAction(
          perTier ? base.blockMinutes : draft.blockMinutes,
          perTier ? base.pointsPerBlock : draft.pointsPerBlock,
          draft.isActive,
        );
        if (!r.ok) {
          onError(r.message ?? "Could not save.");
          return;
        }
      }
      onError(null);
      toast.success(t("points.ruleSaved"));
    });

  const inputClass =
    "border border-line rounded-md px-3.5 py-2.5 font-display text-md font-semibold tabular-nums tracking-tight w-[120px] text-right outline-none disabled:bg-surface-sunken disabled:text-text-muted";

  const legacyFields: { key: "blockMinutes" | "pointsPerBlock"; label: string }[] = [
    { key: "blockMinutes", label: t("points.ruleBlock") },
    { key: "pointsPerBlock", label: t("points.rulePoints") },
  ];

  return (
    <div className="bg-surface border border-line rounded-md p-6">
      <div className="flex items-center gap-2.5 mb-2">
        <span className="w-7 h-7 rounded-md bg-accent-soft text-accent flex items-center justify-center flex-none">
          <Star size={15} />
        </span>
        <span className="text-md font-bold">{t("points.ruleTitle")}</span>
      </div>
      <p className="text-xs text-text-muted leading-relaxed m-0 mb-5">
        {perTier ? t("points.tierSub") : t("points.ruleSub")}
      </p>

      <div className="flex flex-col gap-4">
        {perTier
          ? tiers.map((tier) => (
              <div key={tier} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  <TierBadge tier={tier} />
                  <span>{t("points.tierPerHour")}</span>
                </div>
                <input
                  type="number"
                  min={0}
                  aria-label={`${tier} ${t("points.tierPerHour")}`}
                  value={draftTiers[tier] ?? 0}
                  disabled={!canEdit || pending}
                  onChange={(e) => setDraftTiers((d) => ({ ...d, [tier]: Number(e.target.value) || 0 }))}
                  className={inputClass}
                />
              </div>
            ))
          : legacyFields.map((f) => (
              <div key={f.key} className="flex items-center justify-between gap-3">
                <div className="text-sm font-semibold">{f.label}</div>
                <input
                  type="number"
                  min={f.key === "blockMinutes" ? 1 : 0}
                  value={draft[f.key]}
                  disabled={!canEdit || pending}
                  onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) || 0 }))}
                  className={inputClass}
                />
              </div>
            ))}

        <label className="flex items-center justify-between gap-3 cursor-pointer">
          <span className="text-sm font-semibold">{t("points.ruleActive")}</span>
          <input
            type="checkbox"
            checked={draft.isActive}
            disabled={!canEdit || pending}
            onChange={(e) => setDraft((d) => ({ ...d, isActive: e.target.checked }))}
            className="size-4"
          />
        </label>
      </div>

      {invalid && (
        <div className="text-2xs text-danger mt-2">
          {perTier ? t("points.tierInvalid") : t("points.ruleInvalid")}
        </div>
      )}

      <div className="mt-3.5 text-2xs text-text-muted leading-relaxed">{t("points.ruleFutureOnly")}</div>

      <button
        onClick={save}
        disabled={!canEdit || pending || !dirty || invalid}
        className="w-full mt-4 bg-accent text-white rounded-md hover:bg-accent-strong transition-colors py-3 text-sm font-semibold disabled:opacity-45"
      >
        {pending ? t("record.saving") : t("points.ruleSave")}
      </button>
    </div>
  );
}
