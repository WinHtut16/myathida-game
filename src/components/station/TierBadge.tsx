import type { Tier } from "@/lib/types";
import { TIER_STYLE } from "@/lib/ui";

export function TierBadge({ tier }: { tier: Tier }) {
  const s = TIER_STYLE[tier];
  return (
    <span
      className="font-mono text-[10.5px] font-semibold px-[7px] py-0.5 rounded tracking-[.03em]"
      style={{ background: s.bg, color: s.ink, border: s.border ? `1px solid ${s.border}` : undefined }}
    >
      {s.label}
    </span>
  );
}
