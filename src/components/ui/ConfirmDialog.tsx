"use client";

import { useEffect, useId } from "react";
import { AlertTriangle, HelpCircle, Trash2 } from "lucide-react";
import { cx } from "@/lib/ui";
import { Button } from "./Button";

interface ConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning" | "default";
  isLoading?: boolean;
}

/**
 * Destructive-confirmation tier 1 — reversible action or a single-row
 * delete. See DESIGN.md. Mobile-first button order: primary (colored by
 * variant) on top, cancel below.
 */
export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  variant = "default",
  isLoading = false,
}: ConfirmDialogProps) {
  const titleId = useId();

  useEffect(() => {
    if (!isOpen) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const iconWrap = cx(
    "mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full",
    variant === "danger" && "bg-status-expired-bd",
    variant === "warning" && "bg-status-warn-bg",
    variant === "default" && "bg-line-faint"
  );
  const iconClass = cx(
    "h-6 w-6",
    variant === "danger" && "text-status-expired-ink",
    variant === "warning" && "text-status-warn-ink",
    variant === "default" && "text-text-secondary"
  );

  return (
    <div
      className="fixed inset-0 z-[var(--z-modal)] flex items-center justify-center p-4 bg-black/40"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="w-full max-w-sm rounded-xl bg-surface p-6 shadow-modal">
        <div className={iconWrap}>
          {variant === "danger" && <Trash2 className={iconClass} />}
          {variant === "warning" && <AlertTriangle className={iconClass} />}
          {variant === "default" && <HelpCircle className={iconClass} />}
        </div>
        <h3 id={titleId} className="text-center text-[15px] font-bold">{title}</h3>
        <p className="mt-1.5 text-center text-[13px] text-text-secondary">{message}</p>
        <div className="mt-5 flex flex-col gap-2">
          <Button
            variant={variant === "warning" ? "primary" : variant === "danger" ? "danger" : "primary"}
            onClick={onConfirm}
            loading={isLoading}
            className="w-full"
          >
            {confirmLabel}
          </Button>
          <Button variant="ghost" onClick={onClose} disabled={isLoading} className="w-full">
            {cancelLabel}
          </Button>
        </div>
      </div>
    </div>
  );
}
