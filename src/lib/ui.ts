import type { Tier } from "./types";

/** Interpolate {n}-style placeholders in an i18n string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Badge styling per pricing tier. Values are design-token references
 * (globals.css --game-*), so the tiers move with the palette. A three-step
 * value ladder — light grey, dark slate, gold — so the tier reads across a
 * room and none of the chips collide with the accent-blue buttons or the
 * green/amber station states:
 *   PS4 — base tier, light grey chip
 *   PS5 — current gen, dark slate chip
 *   VIP — premium, gold chip */
export const TIER_STYLE: Record<Tier, { bg: string; ink: string; border?: string; label: string }> = {
  PS4: {
    bg: "var(--game-line-faint)",
    ink: "var(--game-text-secondary)",
    border: "var(--game-line-soft)",
    label: "PS4",
  },
  PS5: {
    bg: "var(--game-slate)",
    ink: "#ffffff",
    label: "PS5",
  },
  VIP: {
    bg: "var(--game-status-warn)",
    ink: "#231600",
    label: "VIP",
  },
};
