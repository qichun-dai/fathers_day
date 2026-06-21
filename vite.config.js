import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(() => {
  const pagesUrl = process.env.CI_PAGES_URL;
  let base = "/";

  if (pagesUrl) {
    try {
      const path = new URL(pagesUrl).pathname;
      base = path.endsWith("/") ? path : `${path}/`;
    } catch {
      base = "/";
    }
  }

  return {
    base,
    plugins: [react()],
  };
});
