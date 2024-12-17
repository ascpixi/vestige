import daisyui from "daisyui";
import type { Config } from "tailwindcss";

export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        mono: ["Fira Code", "Cascadia Mono", "Cascadia Code", "JetBrains Mono", "Consolas", "monospace"]
      },
      colors: {
        background: "var(--background)",
        foreground: "var(--foreground)",
      },
    },
  },
  plugins: [daisyui],
  daisyui: {
    themes: ["light", "dark", "garden"],
  },
} satisfies Config;
