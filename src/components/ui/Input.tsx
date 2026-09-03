import type { InputHTMLAttributes } from "react";
import { cx } from "@/lib/ui";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  error?: boolean;
}

/** Wraps the existing `.field` global class (globals.css) — same visual
 * this app already uses for every text input, now available as a
 * component instead of a bare className string. */
export function Input({ error, className, ...props }: InputProps) {
  return (
    <input
      className={cx("field", error && "border-status-expired", className)}
      {...props}
    />
  );
}
