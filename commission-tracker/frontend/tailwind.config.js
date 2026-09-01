export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        // 4Geeks Brand Colors
        charcoal: "#1a1a1a",
        "charcoal-light": "#2d2d2d",
        orange: "#ff7c3e",
        "orange-hover": "#ff6a1f",
        blue: "#0066cc",
        "blue-hover": "#0052a3",
        "light-gray": "#f5f5f5",
        "border-gray": "#ddd",
      },
      fontFamily: {
        archivo: ["Archivo", "sans-serif"],
        hanken: ["Hanken Grotesk", "sans-serif"],
      },
      boxShadow: {
        sm: "0 2px 4px rgba(0,0,0,0.05)",
        md: "0 4px 6px rgba(0,0,0,0.1)",
      },
    },
  },
  plugins: [],
};
