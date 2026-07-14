/** @type {import('tailwindcss').Config} */

export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    container: {
      center: true,
    },
    extend: {
      colors: {
        // 主色调：深墨蓝底色
        canvas: {
          DEFAULT: "rgb(var(--color-canvas) / <alpha-value>)",
          elevated: "rgb(var(--color-canvas-elevated) / <alpha-value>)",
          sunken: "rgb(var(--color-canvas-sunken) / <alpha-value>)",
        },
        // 边框与分隔
        line: {
          DEFAULT: "rgb(var(--color-line) / <alpha-value>)",
          subtle: "rgb(var(--color-line-subtle) / <alpha-value>)",
          strong: "rgb(var(--color-line-strong) / <alpha-value>)",
        },
        // 强调色：青柠
        accent: {
          DEFAULT: "rgb(var(--color-accent) / <alpha-value>)",
          hover: "rgb(var(--color-accent-hover) / <alpha-value>)",
          muted: "rgb(var(--color-accent-muted) / <alpha-value>)",
          glow: "rgb(var(--color-accent) / 0.15)",
        },
        // 警示色：暖橙
        warn: {
          DEFAULT: "rgb(var(--color-warn) / <alpha-value>)",
          muted: "rgb(var(--color-warn-muted) / <alpha-value>)",
        },
        // 危险色
        danger: {
          DEFAULT: "rgb(var(--color-danger) / <alpha-value>)",
          muted: "rgb(var(--color-danger-muted) / <alpha-value>)",
        },
        // 文本
        ink: {
          primary: "rgb(var(--color-ink-primary) / <alpha-value>)",
          secondary: "rgb(var(--color-ink-secondary) / <alpha-value>)",
          muted: "rgb(var(--color-ink-muted) / <alpha-value>)",
        },
      },
      fontFamily: {
        display: ['"Space Grotesk"', "sans-serif"],
        sans: ['"IBM Plex Sans"', "sans-serif"],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      fontSize: {
        "2xs": ["0.6875rem", { lineHeight: "1rem" }],
      },
      boxShadow: {
        glow: "0 0 24px rgba(163, 230, 53, 0.2)",
        card: "0 4px 24px rgba(0, 0, 0, 0.3)",
        pop: "0 8px 32px rgba(0, 0, 0, 0.5)",
      },
      animation: {
        "fade-in": "fade-in 0.2s ease-out",
        "slide-up": "slide-up 0.25s ease-out",
        "slide-down": "slide-down 0.25s ease-out",
        "scale-in": "scale-in 0.15s ease-out",
        "pulse-soft": "pulse-soft 2s ease-in-out infinite",
        shake: "shake 0.3s ease-in-out",
        "flash-bg": "flash-bg 0.6s ease-out",
        "flash-error": "flash-error 0.5s ease-out",
        "bounce-in": "bounce-in 0.4s cubic-bezier(0.34, 1.56, 0.64, 1)",
        "float-up": "float-up 1s ease-out forwards",
        "particle-rise": "particle-rise 0.8s ease-out forwards",
        "glow-pulse": "glow-pulse 0.8s ease-out",
      },
      keyframes: {
        "fade-in": {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        "slide-up": {
          "0%": { opacity: "0", transform: "translateY(8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "slide-down": {
          "0%": { opacity: "0", transform: "translateY(-8px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "scale-in": {
          "0%": { opacity: "0", transform: "scale(0.96)" },
          "100%": { opacity: "1", transform: "scale(1)" },
        },
        "pulse-soft": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.6" },
        },
        shake: {
          "0%, 100%": { transform: "translateX(0)" },
          "20%, 60%": { transform: "translateX(-4px)" },
          "40%, 80%": { transform: "translateX(4px)" },
        },
        "flash-bg": {
          "0%": { backgroundColor: "rgba(163, 230, 53, 0)" },
          "30%": { backgroundColor: "rgba(163, 230, 53, 0.25)" },
          "100%": { backgroundColor: "rgba(163, 230, 53, 0)" },
        },
        "flash-error": {
          "0%": { backgroundColor: "rgba(248, 113, 113, 0)" },
          "30%": { backgroundColor: "rgba(248, 113, 113, 0.2)" },
          "100%": { backgroundColor: "rgba(248, 113, 113, 0)" },
        },
        "bounce-in": {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "50%": { transform: "scale(1.05)", opacity: "1" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        "float-up": {
          "0%": { transform: "translateY(0)", opacity: "1" },
          "100%": { transform: "translateY(-40px)", opacity: "0" },
        },
        "particle-rise": {
          "0%": { transform: "translateY(0) scale(1)", opacity: "1" },
          "100%": { transform: "translateY(-60px) scale(0.3)", opacity: "0" },
        },
        "glow-pulse": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgba(163, 230, 53, 0.4)" },
          "50%": { boxShadow: "0 0 20px 4px rgba(163, 230, 53, 0.3)" },
        },
      },
    },
  },
  plugins: [],
};
