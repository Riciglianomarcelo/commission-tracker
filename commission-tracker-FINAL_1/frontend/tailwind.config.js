export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 4Geeks Academy brand tokens (4geeksacademy.com design system)
        blue: "#2381FF",
        "blue-hover": "#1B6FE0",
        "blue-tint": "#EFF6FF",
        "blue-soft": "#E9F2FE",
        ink: "#0B0B0F",
        body: "#5C6470",
        muted: "#8A93A0",
        "bg-gray": "#F5F7FA",
        border: "#E6E9EF",
        red: "#E5484D",
        "red-soft": "#FDECEC",
        amber: "#F5B93E",
        "amber-soft": "#FDF3D7",
        cream: "#FFF6E0",
        navy: "#0E1B2C",
        star: "#F5A623",
      },
      fontFamily: {
        sans: ["Inter", "sans-serif"],
      },
      borderRadius: {
        card: "20px",
        pill: "999px",
      },
      boxShadow: {
        card: "0 1px 3px rgba(16,24,40,.06)",
      },
    },
  },
  plugins: [],
};
