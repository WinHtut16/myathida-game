"use client";

import { useEffect, useId } from "react";
import { X } from "lucide-react";
import { cx } from "@/lib/ui";

interface DialogProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Base modal — matches the shape this app's two existing modals
 * (RecordSessionModal, ReceiptModal) already hand-write: centered panel,
 * header with a close button, `shadow-modal`. Adds what those two didn't
 * have — role="dialog", aria-modal, Escape-to-close — per DESIGN.md.
 */
export function Dialog({ open, onClose, title, children, className }: DialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center bg-black/40 p-6"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className={cx("w-[420px] max-w-full max-h-[86vh] overflow-auto bg-surface rounded-xl shadow-modal", className)}>
        <div className="flex items-center justify-between p-[18px] px-[22px] border-b border-line-faint">
          <h2 id={titleId} className="text-[17px] font-bold">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-text-muted hover:bg-line-faint"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>
        <div className="p-[22px]">{children}</div>
      </div>
    </div>
  );
}
