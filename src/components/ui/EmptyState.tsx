import type { LucideIcon } from "lucide-react";
import { cx } from "@/lib/ui";

interface EmptyStateAction {
  label: string;
  onClick?: () => void;
}

interface EmptyStateProps {
  icon: LucideIcon;
  message: string;
  action?: EmptyStateAction;
  className?: string;
}

/**
 * Shared empty-state recipe — see DESIGN.md. Icon tile → message →
 * optional CTA. This app currently has bare `.map()`s over nothing with
 * no empty state at all on /menu and /admins-equivalent screens.
 */
export function EmptyState({ icon: Icon, message, action, className }: EmptyStateProps) {
  return (
    <div className={cx("text-center py-14 bg-surface border border-line rounded-[11px]", className)}>
      <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-[11px] bg-line-faint">
        <Icon className="h-7 w-7 text-text-faint" />
      </div>
      <p className="text-[13px] font-medium text-text-muted">{message}</p>
      {action && (
        <button onClick={action.onClick} className="mt-2 text-[13px] font-semibold text-accent hover:underline">
          {action.label}
        </button>
      )}
    </div>
  );
}
