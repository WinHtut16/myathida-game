import type { ButtonHTMLAttributes } from "react";
import { cx } from "@/lib/ui";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  size?: "sm" | "md" | "lg";
  loading?: boolean;
}

/**
 * Shared button vocabulary — see DESIGN.md. Variant classes mirror what
 * every existing screen already hand-writes for its primary/secondary/
 * destructive actions (`bg-ink text-white rounded-lg…`, `bg-status-expired
 * text-white…`), so this can replace those call sites screen by screen
 * with no visual change, rather than the other way round.
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
    "inline-flex items-center justify-center gap-2 font-semibold rounded-lg transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-accent disabled:opacity-45 disabled:cursor-not-allowed";

  const variants = {
    primary: "bg-ink text-white hover:opacity-90",
    secondary: "bg-surface text-text border border-line hover:bg-line-faint",
    danger: "bg-status-expired text-white hover:opacity-90",
    ghost: "text-text-secondary hover:bg-line-faint",
  };

  const sizes = {
    sm: "px-3 py-1.5 text-[12.5px]",
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
