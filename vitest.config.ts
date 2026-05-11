// Vitest config, separate from vite.config.ts so the production build stays
// untouched by test-only concerns (happy-dom polyfills, test plugin order,
// service-worker plugin etc.). Aliases mirror vite.config.ts so `@/foo`
// imports resolve identically in tests.

import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // happy-dom gives DOM globals when we mount components or touch canvas.
    // For pure-function tests it costs ~nothing.
    environment: "happy-dom",
    include: ["src/**/*.{test,spec}.ts"],
    exclude: ["node_modules", "dist", ".vercel"],
    // Explicit imports from "vitest" — no `globals: true` so TypeScript
    // doesn't need `"vitest/globals"` in tsconfig types.
    globals: false,
    clearMocks: true,
  },
});
