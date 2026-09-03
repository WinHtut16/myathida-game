import type { Config } from "tailwindcss";

/**
 * Design tokens, originally lifted directly from the Claude Design handoff
 * (docs/design-handoff/project/MyaThida.dc.html) as literal hex/rgba values.
 *
 * Now indirected through CSS custom properties instead: the --game-* ones
 * are local, defined in globals.css :root; --color-surface comes from the
 * shared contract in design/tokens.css (see DESIGN.md), which this app also
 * imports. This is a mechanical value->var conversion, not yet a retarget
 * onto the shared semantic colors (success/warning/danger/info) — Game's
 * 5-state status vocabulary doesn't map 1:1 onto the shared 4-state one, and
 * reconciling that is real design work for the screen-pattern pass, not
 * this wiring step.
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: "var(--game-rail)",
        ink: "var(--game-ink)",
        canvas: "var(--game-canvas)",
        "app-bg": "var(--game-app-bg)",
        surface: "var(--color-surface)",
        line: {
          DEFAULT: "var(--game-line)",
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
        accent: "var(--game-accent)",
        accent2: "var(--game-accent2)",
        status: {
          idle: "var(--game-status-idle)",
          active: "var(--game-status-active)",
          "active-ink": "var(--game-status-active-ink)",
          "active-bg": "var(--game-status-active-bg)",
          warn: "var(--game-status-warn)",
          "warn-ink": "var(--game-status-warn-ink)",
          "warn-deep": "var(--game-status-warn-deep)",
          "warn-bg": "var(--game-status-warn-bg)",
          expired: "var(--game-status-expired)",
          "expired-ink": "var(--game-status-expired-ink)",
          "expired-bd": "var(--game-status-expired-bd)",
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
      // Var names match the shared admin-suite convention (design/tokens.css)
      // — same underlying font files as PointSystem_AkoATP and
      // Billiards_MyaThida — while keeping this app's own defensive
      // fallback-inside-var() pattern (see the comment on `sans` below).
      fontFamily: {
        sans: ["var(--font-plex-sans, system-ui)", "system-ui", "sans-serif"],
        mono: ["var(--font-plex-mono, ui-monospace)", "ui-monospace", "monospace"],
        mm: ["var(--font-noto-my, var(--font-plex-sans, system-ui))", "system-ui", "sans-serif"],
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
