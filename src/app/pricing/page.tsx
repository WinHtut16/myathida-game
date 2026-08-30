"use client";

import { useState } from "react";
import { AppShell } from "@/components/layout/AppShell";
import { useStore } from "@/lib/data/store";
import { useT } from "@/i18n";
import { TierBadge } from "@/components/station/TierBadge";
import type { Pricing, Tier } from "@/lib/types";

const TIERS: Tier[] = ["PS4", "PS5", "VIP"];

export default function PricingPage() {
  const { t } = useT();
  const { state, isSuperadmin } = useStore();

  if (!isSuperadmin()) {
    return (
      <AppShell title={t("nav.pricing")}>
        <div className="p-8 text-text-muted text-sm">{t("settings.superOnly")}</div>
      </AppShell>
    );
  }

  return (
    <AppShell title={t("nav.pricing")}>
      <div className="p-5 px-[22px] grid grid-cols-3 gap-4 max-w-[1100px]">
        {TIERS.map((tier) => {
          const p = state.pricing.find((x) => x.tier === tier)!;
          return <RateCard key={tier} pricing={p} />;
        })}
      </div>
    </AppShell>
  );
}

function RateCard({ pricing }: { pricing: Pricing }) {
  const { t } = useT();
  const { dispatch } = useStore();
  const [draft, setDraft] = useState({ ratePerHour: pricing.ratePerHour, minMinutes: pricing.minMinutes });

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
          <div key={r.key} className="flex items-center justify-between">
            <div>
              <div className="text-sm font-semibold">{r.label}</div>
              <div className="text-xs text-text-muted">{r.sub}</div>
            </div>
            <input
              type="number"
              value={draft[r.key]}
              onChange={(e) => setDraft((d) => ({ ...d, [r.key]: Number(e.target.value) || 0 }))}
              className="border border-line rounded-lg px-3.5 py-2.5 font-mono text-[15px] font-semibold w-[120px] text-right outline-none"
            />
          </div>
        ))}
      </div>
      <button
        onClick={() => dispatch({ type: "UPDATE_PRICING", tier: pricing.tier, patch: draft })}
        className="w-full mt-[22px] bg-ink text-white rounded-lg py-3 text-sm font-semibold"
      >
        {t("pricing.save")}
      </button>
    </div>
  );
}
