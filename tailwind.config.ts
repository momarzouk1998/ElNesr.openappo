import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        // 🟦 اللون الرئيسي — شركة النسر (Brand: Electric Navy #0F4185)
        elnesr: {
          50:  "#eef4ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93bbfd",
          400: "#609afa",
          500: "#0f4185",  // ← PRIMARY ELECTRIC NAVY
          600: "#002b61",
          700: "#00204a",
          800: "#001735",
          900: "#000e22",
        },
        elhoot: {
          50:  "#eef4ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93bbfd",
          400: "#609afa",
          500: "#0f4185",
          600: "#002b61",
          700: "#00204a",
          800: "#001735",
          900: "#000e22",
        },
        // 🟧 اللون الثانوي — برتقالي تحذيري وحيوي (Caution Orange #F7941D)
        amberAccent: {
          50:  "#fff8eb",
          100: "#fdeed2",
          200: "#fbdda5",
          300: "#f8c46d",
          400: "#f7a833",
          500: "#f7941d",
          600: "#d97706",
          700: "#b45309",
          800: "#92400e",
          900: "#78350f",
        },
        // التوافق مع الكلاسات القديمة
        nazlawy: {
          50:  "#eef4ff",
          100: "#dbe8fe",
          200: "#bfd7fe",
          300: "#93bbfd",
          400: "#609afa",
          500: "#0f4185",
          600: "#002b61",
          700: "#00204a",
          800: "#001735",
          900: "#000e22",
        },
        slate: {
          650: "#1e293b",
        },
      },
      fontFamily: {
        sans: ["var(--font-cairo)", "system-ui", "sans-serif"],
      },
      backgroundImage: {
        "header-gradient": "linear-gradient(135deg, #002b61, #0f4185)",
        "button-orange":  "linear-gradient(135deg, #f7941d, #d97706)",
        "button-navy":    "linear-gradient(135deg, #0f4185, #002b61)",
        "button-gray":    "linear-gradient(135deg, #6c757d, #5a6268)",
        "button-green":   "linear-gradient(135deg, #28a745, #20c997)",
      },
    },
  },
  plugins: [],
};

export default config;
