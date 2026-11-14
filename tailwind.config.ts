import type { Config } from "tailwindcss";

// Token colours that accept Tailwind opacity modifiers (bg-teal/10, border-edge/40 ...).
const c = (v: string) => `color-mix(in srgb, var(${v}) calc(<alpha-value> * 100%), transparent)`;

const config: Config = {
  darkMode: ["class", '[data-theme="dark"]'],
  content: [
    "./src/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: c("--bg"),
        // shadcn/ui aliases (R3 primitives) mapped onto TaskBoard tokens — both themes follow automatically.
        background: c("--bg"),
        foreground: c("--ink"),
        popover: { DEFAULT: c("--surface"), foreground: c("--ink") },
        card: { DEFAULT: c("--surface"), foreground: c("--ink") },
        border: "var(--border-default)",
        input: c("--edge"),
        ring: c("--teal"),
        primary: { DEFAULT: c("--teal"), foreground: "white" },
        secondary: { DEFAULT: c("--raised"), foreground: c("--ink") },
        destructive: { DEFAULT: c("--crimson"), foreground: "white" },
        // CRM port (src/crm-ui): DEFAULT keeps every existing TaskBoard class unchanged.
        surface: { DEFAULT: c("--surface"), subtle: c("--bg"), muted: c("--raised") },
        raised: c("--raised"),
        hover: c("--hover"),
        edge: c("--edge"),
        line: { DEFAULT: c("--line"), strong: c("--edge") },
        ink: { DEFAULT: c("--ink"), muted: c("--ink2"), subtle: c("--muted"), faint: c("--faint") },
        ink2: c("--ink2"),
        muted: { DEFAULT: c("--muted"), foreground: c("--ink2") },
        faint: c("--faint"),
        teal: c("--teal"),
        tealhi: c("--tealhi"),
        accent: { DEFAULT: c("--accent"), foreground: c("--ink"), 50: "var(--crm-accent-50)", 100: "var(--crm-accent-100)", 200: "var(--crm-accent-200)", 300: "var(--crm-accent-300)", 400: "var(--crm-accent-400)", 500: "var(--crm-accent-500)", 600: "var(--crm-accent-600)", 700: "var(--crm-accent-700)", 800: "var(--crm-accent-800)", 900: "var(--crm-accent-900)", 950: "var(--crm-accent-950)" },
        "accent-hi": c("--accent-hi"),
        emerald: c("--emerald"),
        amber: c("--amber"),
        crimson: c("--crimson"),
        violet: c("--violet"),
        pink: c("--pink"),
        // CRM port palettes — backed by --crm-* vars in globals.css (light + dark).
        brand: { 50: "var(--crm-brand-50)", 100: "var(--crm-brand-100)", 200: "var(--crm-brand-200)", 300: "var(--crm-brand-300)", 400: "var(--crm-brand-400)", 500: "var(--crm-brand-500)", 600: "var(--crm-brand-600)", 700: "var(--crm-brand-700)", 800: "var(--crm-brand-800)", 900: "var(--crm-brand-900)", 950: "var(--crm-brand-950)" },
        navy: { 50: "var(--crm-navy-50)", 100: "var(--crm-navy-100)", 200: "var(--crm-navy-200)", 300: "var(--crm-navy-300)", 400: "var(--crm-navy-400)", 500: "var(--crm-navy-500)", 600: "var(--crm-navy-600)", 700: "var(--crm-navy-700)", 800: "var(--crm-navy-800)", 900: "var(--crm-navy-900)", 950: "var(--crm-navy-950)" },
        success: { 50: "var(--crm-success-50)", 100: "var(--crm-success-100)", 200: "var(--crm-success-200)", 500: "var(--crm-success-500)", 600: "var(--crm-success-600)", 700: "var(--crm-success-700)" },
        warning: { 50: "var(--crm-warning-50)", 100: "var(--crm-warning-100)", 200: "var(--crm-warning-200)", 500: "var(--crm-warning-500)", 600: "var(--crm-warning-600)", 700: "var(--crm-warning-700)" },
        danger: { 50: "var(--crm-danger-50)", 100: "var(--crm-danger-100)", 200: "var(--crm-danger-200)", 500: "var(--crm-danger-500)", 600: "var(--crm-danger-600)", 700: "var(--crm-danger-700)" },
        info: { 50: "var(--crm-info-50)", 100: "var(--crm-info-100)", 200: "var(--crm-info-200)", 500: "var(--crm-info-500)", 600: "var(--crm-info-600)", 700: "var(--crm-info-700)" },
        deptCrimson: "#F85149",
        deptTeal: "#3E8B93",
        deptViolet: "#A78BFA",
        deptTealhi: "#56A7B0",
        deptEmerald: "#6DBB7C",
        deptAmber: "#D29922",
        deptGray: "#8B949E",
      },
      fontFamily: {
        sans: ["Inter", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "sans-serif"],
        mono: ['"JetBrains Mono"', "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        // CRM port (src/crm-ui) — new names only, no TaskBoard class changes.
        card: "0 1px 2px 0 rgba(0, 0, 0, 0.12)",
        popover: "0 4px 6px -2px rgba(0, 0, 0, 0.10), 0 12px 16px -4px rgba(0, 0, 0, 0.22)",
        dropdown: "0 4px 6px -2px rgba(0, 0, 0, 0.10), 0 12px 16px -4px rgba(0, 0, 0, 0.22)",
      },
      letterSpacing: {
        "label": "0.08em",
      },
    },
  },
  plugins: [],
};

export default config;
