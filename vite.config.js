import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  // For project pages, serve assets under /<repo>/ in production.
  base:  "./",
  plugins: [react()],
  build: {
    outDir: "docs",
    emptyOutDir: true,
  },
});
