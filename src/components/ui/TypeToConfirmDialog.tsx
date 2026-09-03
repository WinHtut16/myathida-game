"use client";

import { useEffect, useId, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "./Button";
import { Input } from "./Input";

interface TypeToConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  /** Kept in English regardless of UI language — see DESIGN.md. */
  confirmWord: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isLoading?: boolean;
}

/**
 * Destructive-confirmation tier 2 — irreversible bulk action. See
 * DESIGN.md. Tier 3 (reason-required correction) is this app's existing
 * inline session-void reveal — SessionTable.tsx — not a dialog at all.
 */
export function TypeToConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmWord,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  isLoading = false,
}: TypeToConfirmDialogProps) {
  const titleId = useId();
  const inputId = useId();
  const [typed, setTyped] = useState("");

  useEffect(() => {
    if (!isOpen) return;
    setTyped("");
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const matches = typed === confirmWord;

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
        <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-status-expired-bd">
          <AlertTriangle className="h-6 w-6 text-status-expired-ink" />
        </div>
        <h3 id={titleId} className="text-center text-[15px] font-bold">{title}</h3>
        <p className="mt-1.5 text-center text-[13px] text-text-secondary">{message}</p>

        <label htmlFor={inputId} className="mt-4 mb-1.5 block text-[11px] tracking-[.1em] uppercase text-text-muted font-semibold">
          Type <span className="font-mono font-semibold text-ink">{confirmWord}</span> to confirm
        </label>
        <Input
          id={inputId}
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          disabled={isLoading}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />

        <div className="mt-5 flex flex-col gap-2">
          <Button variant="danger" onClick={onConfirm} loading={isLoading} disabled={!matches} className="w-full">
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
