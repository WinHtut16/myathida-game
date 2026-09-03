"use client";

import { useEffect, useId } from "react";
import { cx } from "@/lib/ui";

interface SheetProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  className?: string;
}

/**
 * Bottom sheet — the mobile nav's "More" menu, and any other mobile-first
 * drawer. See DESIGN.md. Uses shadow-drawer (already wired in
 * tailwind.config.ts / globals.css from the Phase 1 token pass).
 */
export function Sheet({ open, onClose, title, children, className }: SheetProps) {
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
      className="fixed inset-0 z-[var(--z-modal)] flex items-end justify-center"
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? titleId : undefined}
    >
      <div className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div
        className={cx(
          "relative w-full sm:max-w-md bg-surface rounded-t-3xl shadow-drawer",
          "pb-[calc(env(safe-area-inset-bottom)+1rem)]",
          className
        )}
      >
        <div className="flex justify-center pt-2.5 pb-1">
          <div className="h-1 w-10 rounded-full bg-line" />
        </div>
        {title && (
          <div className="px-5 pb-2">
            <h2 id={titleId} className="text-[15px] font-bold">{title}</h2>
          </div>
        )}
        <div className="px-5 pt-2">{children}</div>
      </div>
    </div>
  );
}
