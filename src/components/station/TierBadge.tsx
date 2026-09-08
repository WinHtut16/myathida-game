import type { Tier } from "@/lib/types";
import { TIER_STYLE } from "@/lib/ui";

export function TierBadge({ tier }: { tier: Tier }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className="font-display text-2xs font-semibold px-[7px] py-0.5 rounded-sm tracking-caps uppercase"
      style={{ background: s.bg, color: s.ink, border: s.border ? `1px solid ${s.border}` : undefined }}
    >
      {s.label}
    </span>
  );
}
