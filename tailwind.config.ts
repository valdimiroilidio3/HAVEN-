import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        porcelain: "#F5F4EF",
        obsidian: "#171916",
        sage: "#A8B29B",
        sand: "#C7A77A",
        ink: {
          50: "#F7F7F5",
          100: "#EEEEEA",
          200: "#DCDCD6",
          300: "#BFBFB6",
          400: "#8F9086",
          500: "#6C6D64",
          600: "#53544D",
          700: "#3E3F39",
          800: "#2A2B27",
          900: "#1D1E1B",
        },
        moss: { 100: "#E8ECE3", 300: "#C4CCB9", 500: "#A8B29B", 700: "#6F7A62" },
        clay: { 100: "#F2E9DC", 300: "#DFC9A9", 500: "#C7A77A", 700: "#96784F" },
      },
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--font-display)", "Georgia", "serif"],
        mono: ["ui-monospace", "SFMono-Regular", "monospace"],
      },
      letterSpacing: {
        tightest: "-0.045em",
        editorial: "-0.02em",
        label: "0.18em",
      },
      borderRadius: {
        xs: "0.25rem",
        sm: "0.375rem",
      },
      boxShadow: {
        panel: "0 1px 2px rgba(23,25,22,0.04), 0 12px 32px -18px rgba(23,25,22,0.28)",
        lift: "0 24px 60px -32px rgba(23,25,22,0.45)",
      },
      keyframes: {
        shimmer: { "100%": { transform: "translateX(100%)" } },
        "fade-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-ring": {
          "0%": { transform: "scale(0.9)", opacity: "0.55" },
          "70%": { transform: "scale(1.5)", opacity: "0" },
          "100%": { opacity: "0" },
        },
      },
      animation: {
        shimmer: "shimmer 1.8s infinite",
        "fade-up": "fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both",
        "pulse-ring": "pulse-ring 2.4s cubic-bezier(0.16,1,0.3,1) infinite",
      },
    },
  },
  plugins: [],
};

export default config;
