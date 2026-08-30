import type { Config } from "tailwindcss";

/**
 * Design tokens lifted directly from the Claude Design handoff
 * (docs/design-handoff/project/MyaThida.dc.html).
 */
const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        rail: "#23262e",
        ink: "#1e2128",
        canvas: "#e9ebef",
        "app-bg": "#eef0f3",
        surface: "#ffffff",
        line: {
          DEFAULT: "#dcdfe5",
          soft: "#e0e3e8",
          faint: "#eef0f3",
          hair: "#f3f4f6",
        },
        text: {
          DEFAULT: "#1e2128",
          secondary: "#5b616e",
          muted: "#8a909c",
          faint: "#b6bcc6",
        },
        accent: "#3b73c4",
        accent2: "#2f5fa8",
        status: {
          idle: "#9aa2af",
          active: "#1a9d6b",
          "active-ink": "#0f7a52",
          "active-bg": "#e7f4ee",
          warn: "#d9920f",
          "warn-ink": "#96590a",
          "warn-deep": "#a86616",
          "warn-bg": "#fbf1df",
          expired: "#d83a25",
          "expired-ink": "#c2321f",
          "expired-bd": "#f0c9c1",
          paused: "#3b73c4",
          "paused-ink": "#2f5fa8",
          "paused-bg": "#e9eff8",
        },
        success: "#17835a",
      },
      fontFamily: {
        sans: ["'IBM Plex Sans'", "system-ui", "sans-serif"],
        mono: ["'IBM Plex Mono'", "ui-monospace", "monospace"],
        mm: ["'Noto Sans Myanmar'", "'IBM Plex Sans'", "sans-serif"],
      },
      boxShadow: {
        card: "0 1px 2px rgba(20,22,28,.04)",
        panel: "0 1px 2px rgba(20,22,28,.04),0 10px 30px rgba(20,22,28,.06)",
        modal: "0 24px 60px rgba(20,22,28,.28)",
        drawer: "-16px 0 50px rgba(20,22,28,.20)",
        expired: "0 0 0 3px rgba(216,58,37,.08)",
      },
    },
  },
  plugins: [],
};

export default config;
