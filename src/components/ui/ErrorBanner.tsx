"use client";

import { TriangleAlert } from "lucide-react";
import { useT } from "@/i18n";
import { cx } from "@/lib/ui";

/**
 * Inline error banner, dismissible. Was copy-pasted into 6 files with a
 * literal `#e5b8b0`/`#fdf3f1`/`#8a3324` triple; now one component riding the
 * shared danger token so it moves with the palette instead of drifting out
 * of sync. See DESIGN.md.
 */
export function ErrorBanner({
  message,
  onDismiss,
  className = "",
}: {
  message: string;
  onDismiss: () => void;
  className?: string;
}) {
  const { t } = useT();
  return (
    <div
      className={cx(
        "flex items-start gap-2.5 rounded-lg border border-danger-soft bg-danger-soft px-4 py-3 text-[13px] text-danger",
        className,
      )}
    >
      <TriangleAlert size={16} className="mt-px flex-none" />
      <div className="flex-1">{message}</div>
      <button onClick={onDismiss} className="font-semibold underline underline-offset-2 flex-none">
        {t("common.dismiss")}
      </button>
    </div>
  );
}
