import type { Tier } from "./types";

/** Interpolate {n}-style placeholders in an i18n string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Badge styling per pricing tier. */
export const TIER_STYLE: Record<Tier, { bg: string; ink: string; border?: string; label: string }> = {
  PS4: { bg: "#f1f3f6", ink: "#1e2128", border: "#dcdfe5", label: "PS4" },
  PS5: { bg: "#1e2128", ink: "#ffffff", label: "PS5" },
  VIP: { bg: "#8a6d1f", ink: "#ffffff", label: "VIP" },
};
