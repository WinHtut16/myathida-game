import type { Tier } from "./types";

/** Interpolate {n}-style placeholders in an i18n string. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? `{${k}}`));
}

export function cx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/** Badge styling per pricing tier. Values are design-token references
 * (globals.css --game-*), so the tiers move with the palette. Three distinct
 * weights so the tier reads across a room, not just up close:
 *   PS4 — base tier, ghost outline pill
 *   PS5 — current gen, solid brand blue
 *   VIP — premium, solid gold */
export const TIER_STYLE: Record<Tier, { bg: string; ink: string; border?: string; label: string }> = {
  PS4: {
    bg: "transparent",
    ink: "var(--game-text-muted)",
    border: "var(--game-line)",
    label: "PS4",
  },
  PS5: {
    bg: "var(--game-accent)",
    ink: "#ffffff",
    label: "PS5",
  },
  VIP: {
    bg: "var(--game-status-warn)",
    ink: "#231600",
    label: "VIP",
  },
};
