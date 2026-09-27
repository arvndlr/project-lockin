/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "-apple-system", "Segoe UI", "Roboto", "Arial", "sans-serif"],
      },
      colors: {
        bg: "#090b12",
        elevated: "#0d1019",
        surface: "#12151f",
        surface2: "#171b28",
        surfaceHover: "#1c202f",
        border: "#232838",
        borderSoft: "#1a1e2b",
        text: "#eef0f7",
        muted: "#8890a4",
        faint: "#565d72",
        primary: {
          DEFAULT: "#6e7bff",
          hi: "#8590ff",
          lo: "#4f5bdb",
        },
        violet: "#a76bff",
        ok: "#29c48d",
        warn: "#f0a83d",
        danger: "#f0567e",
        info: "#4fb2ff",
      },
      borderRadius: {
        sm: "8px",
        md: "12px",
        lg: "18px",
      },
      boxShadow: {
        glow: "0 0 0 1px rgba(110,123,255,0.4), 0 0 24px rgba(110,123,255,0.25)",
        soft: "0 8px 24px -8px rgba(0,0,0,0.5)",
        lg2: "0 24px 64px -16px rgba(0,0,0,0.6)",
      },
      keyframes: {
        fadeIn: { from: { opacity: 0, transform: "translateY(4px)" }, to: { opacity: 1, transform: "none" } },
        shimmer: { "0%": { backgroundPosition: "100% 50%" }, "100%": { backgroundPosition: "0 50%" } },
        shake: { "0%,100%": { transform: "translateX(0)" }, "25%": { transform: "translateX(-6px)" }, "75%": { transform: "translateX(6px)" } },
        pulseBorder: { "0%,100%": { boxShadow: "0 0 0 rgba(240,86,126,0)" }, "50%": { boxShadow: "0 0 0 4px rgba(240,86,126,0.12)" } },
      },
      animation: {
        fadeIn: "fadeIn 0.25s cubic-bezier(0.16,1,0.3,1)",
        shimmer: "shimmer 1.4s ease infinite",
        shake: "shake 0.4s cubic-bezier(0.16,1,0.3,1)",
        pulseBorder: "pulseBorder 1.4s infinite",
      },
    },
  },
  plugins: [],
};
