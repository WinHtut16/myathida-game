import type { Config } from "tailwindcss";

/**
 * Design tokens, originally lifted directly from the Claude Design handoff
 * (docs/design-handoff/project/MyaThida.dc.html) as literal hex/rgba values.
 *
 * Indirected through CSS custom properties: the --game-* ones are local,
 * defined in globals.css :root (retuned to console-blue-tinted oklch ramps);
 * --color-surface and the shared type and radius scales come from the shared
 * contract in design/tokens.css (see DESIGN.md), which this app imports. Game's
 * own 5-state station/session status vocabulary (idle/active/warn/expired/
 * paused) stays local domain color and does not fold into the shared 4-state
 * semantic set — cross-cutting chrome (error banners) uses the shared set
 * directly, further down.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: {
          DEFAULT: "var(--game-rail)",
          hover: "var(--game-rail-hover)",
          line: "var(--game-rail-line)",
          text: "var(--game-rail-text)",
          faint: "var(--game-rail-faint)",
        },
        ink: "var(--game-ink)",
        canvas: "var(--game-canvas)",
        "app-bg": "var(--game-app-bg)",
        surface: {
          DEFAULT: "var(--color-surface)",
          sunken: "var(--game-surface-sunken)",
        },
        line: {
          DEFAULT: "var(--game-line)",
          strong: "var(--color-line-strong)",
          soft: "var(--game-line-soft)",
          faint: "var(--game-line-faint)",
          hair: "var(--game-line-hair)",
        },
        text: {
          DEFAULT: "var(--game-text)",
          secondary: "var(--game-text-secondary)",
          muted: "var(--game-text-muted)",
          faint: "var(--game-text-faint)",
        },
        accent: {
          DEFAULT: "var(--game-accent)",
          strong: "var(--game-accent2)",
          soft: "var(--game-accent-soft)",
        },
        accent2: "var(--game-accent2)",
        slate: "var(--game-slate)",
        status: {
          idle: "var(--game-status-idle)",
          "idle-ink": "var(--game-status-idle-ink)",
          "idle-bg": "var(--game-status-idle-bg)",
          active: "var(--game-status-active)",
          "active-ink": "var(--game-status-active-ink)",
          "active-bd": "var(--game-status-active-bd)",
          "active-bg": "var(--game-status-active-bg)",
          warn: "var(--game-status-warn)",
          "warn-ink": "var(--game-status-warn-ink)",
          "warn-deep": "var(--game-status-warn-deep)",
          "warn-bd": "var(--game-status-warn-bd)",
          "warn-bg": "var(--game-status-warn-bg)",
          expired: "var(--game-status-expired)",
          "expired-ink": "var(--game-status-expired-ink)",
          "expired-bd": "var(--game-status-expired-bd)",
          "expired-bg": "var(--game-status-expired-bg)",
          paused: "var(--game-status-paused)",
          "paused-ink": "var(--game-status-paused-ink)",
          "paused-bg": "var(--game-status-paused-bg)",
        },
        success: "var(--game-success)",
        // Shared cross-cutting chrome (error banners, generic alerts) rides
        // the shared semantic tokens directly. Game's own station/session
        // status vocabulary above (idle/active/warn/expired/paused) stays
        // local domain color, per DESIGN.md's "structure shared, hues owned
        // by each app" rule — these two are not the same thing.
        danger: { DEFAULT: "var(--color-danger)", soft: "var(--color-danger-soft)" },
        warning: { DEFAULT: "var(--color-warning)", soft: "var(--color-warning-soft)" },
        info: { DEFAULT: "var(--color-info)", soft: "var(--color-info-soft)" },
      },
      // The shared type and radius scales (design/tokens.css, imported by
      // globals.css) were defined but never wired into Tailwind here, so
      // components reached for arbitrary values (text-[12.5px], rounded-[11px])
      // and nothing on screen carried real hierarchy. Mapping them in gives
      // one nine-step type ramp and one radius ramp, shared with the hub and
      // billiards. Line-heights are paired from the same token file.
      //
      // NOTE: this retargets Tailwind's own `text-sm`/`text-base`/`rounded-lg`
      // defaults onto the token values (13/14px, 14px radius) — every call
      // site was swept in the same change.
      fontSize: {
        "2xs": ["var(--text-2xs)", { lineHeight: "var(--leading-snug)" }],
        xs: ["var(--text-xs)", { lineHeight: "var(--leading-snug)" }],
        sm: ["var(--text-sm)", { lineHeight: "var(--leading-normal)" }],
        base: ["var(--text-base)", { lineHeight: "var(--leading-normal)" }],
        md: ["var(--text-md)", { lineHeight: "var(--leading-normal)" }],
        lg: ["var(--text-lg)", { lineHeight: "var(--leading-snug)" }],
        xl: ["var(--text-xl)", { lineHeight: "var(--leading-tight)" }],
        "2xl": ["var(--text-2xl)", { lineHeight: "var(--leading-tight)" }],
        "3xl": ["var(--text-3xl)", { lineHeight: "var(--leading-tight)" }],
      },
      borderRadius: {
        sm: "var(--r-sm)",
        md: "var(--r-md)",
        lg: "var(--r-lg)",
        xl: "var(--r-xl)",
        "2xl": "var(--r-2xl)",
        full: "var(--r-full)",
      },
      letterSpacing: {
        tight: "var(--tracking-tight)",
        label: "var(--tracking-label)",
        caps: "var(--tracking-caps)",
      },
      // `sans` is the body/UI face (Inter), `display` the figure/heading face
      // (Space Grotesk) — see src/app/layout.tsx. IBM Plex Mono is gone; every
      // price/duration/KPI now renders in `display` or `sans` with
      // `tabular-nums`. The defensive fallback-inside-var() pattern stays: a
      // bare `var(--font-ui), system-ui` is an invalid declaration when the
      // variable is empty and CSS then falls back to Times New Roman.
      fontFamily: {
        sans: ["var(--font-ui, system-ui)", "system-ui", "sans-serif"],
        display: ["var(--font-display, system-ui)", "system-ui", "sans-serif"],
        mm: ["var(--font-noto-my, var(--font-ui, system-ui))", "system-ui", "sans-serif"],
      },
      boxShadow: {
        card: "var(--game-shadow-card)",
        panel: "var(--game-shadow-panel)",
        modal: "var(--game-shadow-modal)",
        drawer: "var(--game-shadow-drawer)",
        expired: "var(--game-shadow-expired)",
      },
    },
  },
  plugins: [],
};

export default config;
