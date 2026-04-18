import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // Global background
        obsidian: "#030712",
        // Sidebar
        sidebar: "#0B1117",
        "sidebar-border": "#1F2937",
        // Accent palette
        "accent-cyan": "#22D3EE",
        "accent-violet": "#7C3AED",
        "accent-emerald": "#10B981",
        "text-primary": "#F9FAFB",
        "text-muted": "#6B7280",
        "text-subtle": "#374151",
      },
      fontFamily: {
        inter: ["var(--font-inter)", "Inter", "system-ui", "sans-serif"],
      },
      letterSpacing: {
        tight: "-0.02em",
        tighter: "-0.04em",
      },
      backgroundImage: {
        "gradient-radial": "radial-gradient(var(--tw-gradient-stops))",
        "gradient-conic":
          "conic-gradient(from 180deg at 50% 50%, var(--tw-gradient-stops))",
      },
    },
  },
  plugins: [],
};
export default config;
