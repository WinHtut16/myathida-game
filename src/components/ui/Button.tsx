import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/ui";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

/**
 * Shared button vocabulary — see DESIGN.md. `primary` is the brand blue (the
 * accent that marks primary actions suite-wide); `danger` the expired-red;
 * `secondary`/`ghost` the neutral pair. Focus rings come from the global
 * :focus-visible rule in globals.css, so no per-button ring here.
 */
export function Button({
  variant = "primary",
  size = "md",
  loading,
  disabled,
  className,
  children,
  ...props
}: ButtonProps) {
  const base =
    "inline-flex items-center justify-center gap-2 font-semibold rounded-md transition-colors disabled:opacity-45 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-accent text-white hover:bg-accent-strong",
    secondary: "bg-surface text-text border border-line hover:bg-line-faint",
    danger: "bg-status-expired text-white hover:brightness-95",
    ghost: "text-text-secondary hover:bg-line-faint",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-xs",
    md: "px-4 py-2.5 text-sm",
    lg: "px-6 py-3 text-sm w-full",
  };

  return (
    <button
      disabled={disabled || loading}
      className={cx(base, variants[variant], sizes[size], className)}
      {...props}
    >
      {loading && (
        <svg className="h-4 w-4 animate-spin" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
        </svg>
      )}
      {children}
    </button>
  );
}
