import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // For project pages, serve assets under /<repo>/ in production.
  base: process.env.NODE_ENV === "production" ? "/fathers_day/" : "/",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
