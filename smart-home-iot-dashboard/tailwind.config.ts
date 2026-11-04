import type { Config } from "tailwindcss";
const config: Config = { content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"], theme: { extend: { colors: { accent: "#f36b32" }, boxShadow: { soft: "0 8px 28px rgba(25,25,25,.045)" } } }, plugins: [] };
export default config;
