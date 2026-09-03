import { cx } from "@/lib/ui";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "success" | "warning" | "danger" | "neutral";
}

/**
 * Generic status badge — distinct from TierBadge (station/TierBadge.tsx),
 * which is a domain-specific PS4/PS5/VIP indicator with its own fixed
 * palette. This one is for the shared success/warning/danger/neutral
 * vocabulary. See DESIGN.md.
 */
export function Badge({ children, variant = "neutral" }: BadgeProps) {
  const variants = {
    success: "bg-status-active-bg text-status-active-ink",
    warning: "bg-status-warn-bg text-status-warn-ink",
    danger: "bg-status-expired-bd text-status-expired-ink",
    neutral: "bg-line-faint text-text-secondary",
  };

  return (
    <span className={cx("inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-semibold", variants[variant])}>
      {children}
    </span>
  );
}
