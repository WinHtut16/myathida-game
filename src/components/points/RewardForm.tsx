"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { ArrowLeft } from "lucide-react";
import { saveRewardAction } from "@/app/actions/points";
import { Button } from "@/components/ui/Button";
import { ErrorBanner } from "@/components/ui/ErrorBanner";
import { Field } from "@/components/ui/Field";
import { useT } from "@/i18n";
import type { LoyaltyReward } from "@/lib/types";

/** Create or edit one reward (owner only - the database checks too). */
export function RewardForm({ reward }: { reward: LoyaltyReward | null }) {
  const { t } = useT();
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const [form, setForm] = useState({
    name: reward?.name ?? "",
    nameMy: reward?.nameMy ?? "",
    description: reward?.description ?? "",
    descriptionMy: reward?.descriptionMy ?? "",
    pointsCost: reward ? String(reward.pointsCost) : "",
    stock: reward?.stock == null ? "" : String(reward.stock),
  });

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    start(async () => {
      const res = await saveRewardAction({
        id: reward?.id ?? null,
        name: form.name,
        nameMy: form.nameMy,
        description: form.description,
        descriptionMy: form.descriptionMy,
        pointsCost: Number(form.pointsCost),
        stock: form.stock.trim() === "" ? null : Number(form.stock),
      });
      if (!res.ok) {
        setError(res.message ?? null);
        return;
      }
      toast.success(t("pts.saved"));
      router.push("/points/rewards");
    });
  };

  return (
    <form onSubmit={submit} className="bg-surface border border-line rounded-md p-5 sm:p-6 max-w-[560px] flex flex-col gap-4">
      <Link href="/points/rewards" className="inline-flex items-center gap-1.5 text-sm text-text-secondary hover:text-text self-start">
        <ArrowLeft size={15} />
        {t("pts.form.back")}
      </Link>
      <h2 className="text-md font-bold m-0">{t(reward ? "pts.form.titleEdit" : "pts.form.titleNew")}</h2>

      {error && <ErrorBanner message={error} onDismiss={() => setError(null)} />}

      <Field id="r-name" label={t("pts.form.name")} value={form.name} onChange={set("name")} required maxLength={100} />
      <Field id="r-name-my" label={t("pts.form.nameMy")} value={form.nameMy} onChange={set("nameMy")} maxLength={100} />
      <Field id="r-desc" label={t("pts.form.description")} value={form.description} onChange={set("description")} maxLength={1000} />
      <Field id="r-desc-my" label={t("pts.form.descriptionMy")} value={form.descriptionMy} onChange={set("descriptionMy")} maxLength={1000} />
      <div className="grid grid-cols-2 gap-3">
        <Field
          id="r-cost"
          label={t("pts.form.cost")}
          type="number"
          inputMode="numeric"
          min={1}
          value={form.pointsCost}
          onChange={set("pointsCost")}
          required
        />
        <div>
          <Field
            id="r-stock"
            label={t("pts.form.stock")}
            type="number"
            inputMode="numeric"
            min={0}
            value={form.stock}
            onChange={set("stock")}
          />
          <p className="mt-1 text-2xs text-text-muted m-0">{t("pts.form.stockHint")}</p>
        </div>
      </div>

      <Button type="submit" loading={pending} disabled={pending} className="mt-1">
        {t("pts.form.save")}
      </Button>
    </form>
  );
}
