"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Star } from "lucide-react";
import { setPointRuleAction } from "@/app/actions/catalogue";
import { useT } from "@/i18n";
import type { PointRule } from "@/lib/types";

/**
 * The game shop's points rule: N points per FULL block of paid minutes.
 *
 * Shown to every admin (staff answer "how many points do I get?" at the
 * counter); only the game shop's superadmin can change it, and the database
 * enforces that, not this component. A change applies only to sessions that
 * earn from now on - each session freezes the rule it first earned under.
 */
export function PointsRuleCard({
  rule,
  canEdit,
  onError,
}: {
  rule: PointRule | null;
  canEdit: boolean;
  onError: (m: string | null) => void;
}) {
  const { t } = useT();
  const [pending, startTransition] = useTransition();
  const [draft, setDraft] = useState<PointRule>(
    rule ?? { blockMinutes: 60, pointsPerBlock: 10, isActive: false },
  );

  const dirty =
    !rule ||
    draft.blockMinutes !== rule.blockMinutes ||
    draft.pointsPerBlock !== rule.pointsPerBlock ||
    draft.isActive !== rule.isActive;
  const invalid =
    !Number.isInteger(draft.blockMinutes) || draft.blockMinutes < 1 || draft.blockMinutes > 1440 ||
    !Number.isInteger(draft.pointsPerBlock) || draft.pointsPerBlock < 0;

  const save = () =>
    startTransition(async () => {
      const r = await setPointRuleAction(draft.blockMinutes, draft.pointsPerBlock, draft.isActive);
      if (r.ok) {
        onError(null);
        toast.success(t("points.ruleSaved"));
      } else {
        onError(r.message ?? "Could not save.");
      }
    });

  const fields: { key: "blockMinutes" | "pointsPerBlock"; label: string }[] = [
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
      <p className="text-xs text-text-muted leading-relaxed m-0 mb-5">{t("points.ruleSub")}</p>

      <div className="flex flex-col gap-4">
        {fields.map((f) => (
          <div key={f.key} className="flex items-center justify-between gap-3">
            <div className="text-sm font-semibold">{f.label}</div>
            <input
              type="number"
              min={f.key === "blockMinutes" ? 1 : 0}
              value={draft[f.key]}
              disabled={!canEdit || pending}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: Number(e.target.value) || 0 }))}
              className="border border-line rounded-md px-3.5 py-2.5 font-display text-md font-semibold tabular-nums tracking-tight w-[120px] text-right outline-none disabled:bg-surface-sunken disabled:text-text-muted"
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

      {invalid && <div className="text-2xs text-danger mt-2">{t("points.ruleInvalid")}</div>}

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
