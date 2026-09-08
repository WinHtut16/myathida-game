import type { LabelHTMLAttributes } from "react";
import { cx } from "@/lib/ui";

/** The label style every screen currently hand-writes (ProductsView,
 * RecordSessionModal, AccountView, ExportPanel, SessionTable). */
export function Label({ className, ...props }: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cx(
        "block text-2xs tracking-caps uppercase text-text-muted font-semibold mb-1.5",
        className
      )}
      {...props}
    />
  );
}
