import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0a0a0a",
        foreground: "#fafafa",
        card: "#111111",
        "card-foreground": "#fafafa",
        border: "#262626",
        primary: {
          DEFAULT: "#16a34a",
          foreground: "#ffffff",
        },
        danger: "#dc2626",
        warning: "#f59e0b",
        muted: "#a3a3a3",
      },
      borderRadius: {
        DEFAULT: "6px",
      },
    },
  },
  plugins: [],
};
export default config;
