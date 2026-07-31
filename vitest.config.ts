// Vitest config, separate from vite.config.ts so the production build stays
// untouched by test-only concerns (happy-dom polyfills, test plugin order,
// service-worker plugin etc.). Aliases mirror vite.config.ts so `@/foo`
// imports resolve identically in tests.

import { defineConfig } from "vitest/config";
import vue from "@vitejs/plugin-vue";
import path from "node:path";

export default defineConfig({
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // Mirrors vite.config.ts — <model-viewer> is a native custom element.
          isCustomElement: (tag) => tag === "model-viewer",
        },
      },
    }),
  ],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    // `src/lib/supabase.ts` throws at module-import time when VITE_SUPABASE_URL /
    // VITE_SUPABASE_ANON_KEY are missing — a deliberate guardrail so the app never
    // boots half-configured. Tests import it transitively all over the place (any
    // composable -> supabase client), so without values here every one of those
    // files dies at import with "Missing Supabase environment variables".
    //
    // It passes on a dev machine purely because `.env.local` happens to exist and
    // Vite loads it. CI checks out a bare tree, so it does not, and the whole
    // `application` job goes red. Placeholders keep the suite self-contained: no
    // `.env.local`, no CI secrets, no fresh-clone setup step. They are never dialled
    // — every test that touches Supabase mocks the client — and a syntactically
    // valid URL is required because createClient() parses it.
    env: {
      VITE_SUPABASE_URL: "http://localhost:54321",
      VITE_SUPABASE_ANON_KEY: "test-anon-key",
    },
    // happy-dom gives DOM globals when we mount components or touch canvas.
    // For pure-function tests it costs ~nothing.
    environment: "happy-dom",
    // supabase/functions/**: edge functions are Deno, but their PURE logic modules
    // (no Deno/https imports — e.g. _shared/credit-math.ts) are unit-tested here.
    include: [
      "src/**/*.{test,spec}.ts",
      "scripts/**/*.{test,spec}.ts",
      "supabase/functions/**/*.{test,spec}.ts",
    ],
    exclude: ["node_modules", "dist", ".vercel"],
    // Explicit imports from "vitest" — no `globals: true` so TypeScript
    // doesn't need `"vitest/globals"` in tsconfig types.
    globals: false,
    clearMocks: true,
  },
});
