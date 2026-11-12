import { defineConfig } from "vite";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

/**
 * A bare Vite config for the print test (#1176): the app's two aliases and the
 * Vue plugin, nothing else. The real config's Sentry, service-worker and
 * bundle-budget plugins are not wanted in a test page, and it reads env the
 * test does not have.
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname, "../.."),
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "../../src"),
      "@edge-shared": path.resolve(import.meta.dirname, "../../supabase/functions/_shared"),
    },
  },
  logLevel: "warn",
});
