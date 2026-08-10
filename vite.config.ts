import { defineConfig, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Hand-rolled service worker builder.
 *
 * After `closeBundle` (when Vite has finished writing `dist/`), walks the
 * output directory, builds a precache manifest of same-origin assets, hashes
 * the concatenated filename+size list to derive a cache-busting name, and
 * substitutes both into `scripts/sw-template.js` before writing the final
 * `dist/sw.js`. The template itself never ships — it's read off disk at
 * build time only.
 *
 * Replaces vite-plugin-pwa, which was the only blocker keeping us on
 * vite@^7 (its peer dep range caps there and the package has been stale
 * for 5 months with no vite 8 support).
 */
function swPlugin(): Plugin {
  // Matches the old VitePWA `globPatterns`. Everything WebP-converted, so
  // image/* restricted to webp + the few static pngs/svgs/ico we ship.
  const PRECACHE_EXTS = /\.(js|css|html|ico|png|svg|webp|webmanifest)$/i;
  const MAX_BYTES = 3 * 1024 * 1024; // skip anything bigger to keep cache lean

  function walkDist(root: string, prefix = ""): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      // Skip the SW itself and the source-map sidecar files
      if (entry.name === "sw.js" || entry.name.endsWith(".map")) continue;
      const full = path.join(root, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) {
        result.push(...walkDist(full, rel));
      } else if (PRECACHE_EXTS.test(entry.name)) {
        if (statSync(full).size <= MAX_BYTES) result.push("/" + rel);
      }
    }
    return result;
  }

  return {
    name: "grimoire-sw",
    apply: "build",
    closeBundle() {
      const distDir  = path.resolve(__dirname, "dist");
      const template = readFileSync(
        path.resolve(__dirname, "scripts/sw-template.js"),
        "utf8",
      );

      const files = walkDist(distDir).sort();
      // Hash the filename list + sizes so any asset change bumps the cache
      // name, forcing clients to refetch the shell on the next deploy.
      const hasher = createHash("sha256");
      for (const f of files) {
        hasher.update(f);
        hasher.update(String(statSync(path.join(distDir, f.slice(1))).size));
      }
      const cacheName = "grimoire-" + hasher.digest("hex").slice(0, 8);

      // replaceAll — the template's doc comment mentions the placeholder
      // tokens before the code uses them, so first-occurrence replace would
      // rewrite the comment and leave the real const declarations untouched.
      const sw = template
        .replaceAll("__PRECACHE__",   JSON.stringify(files))
        .replaceAll("__CACHE_NAME__", cacheName);
      writeFileSync(path.join(distDir, "sw.js"), sw);

      this.info?.(`SW built: ${files.length} precached, cache=${cacheName}`);
    },
  };
}

export default defineConfig(({ mode }) => ({
  // Root .env.local intentionally contains hosted credentials and Vite loads
  // it after .env.<mode>. Isolate localdb mode in its own env directory so
  // hosted values cannot silently win on precedence.
  envDir: mode === "localdb" ? path.resolve(__dirname, "config/env/localdb") : undefined,
  define: {
    /**
     * Dev-only routes (the Paged.js spike, sheet calibration, the component
     * catalogue) also build for Vercel *preview* deployments, so a PR's preview
     * can be used to review them. Gated on VERCEL_ENV rather than on "not
     * production", so a local `npm run build` — where VERCEL_ENV is unset — still
     * strips them, and a production deploy never sees them.
     */
    __PREVIEW_BUILD__: JSON.stringify(process.env.VERCEL_ENV === "preview"),
  },
  plugins: [
    vue({
      template: {
        compilerOptions: {
          // <model-viewer> (Simulacrum 3D preview) is a native custom element,
          // not a Vue component — don't try to resolve/import it.
          isCustomElement: (tag) => tag === "model-viewer",
        },
      },
    }),
    tailwindcss(),
    swPlugin(),
  ],
  server: {
    // Portless injects PORT so its proxy can reach the dev server.
    // Falls back to 5173 for plain `npm run dev`.
    port: parseInt(process.env.PORT ?? "5173"),
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // Canonical AI-provenance core is pure TS shared verbatim with the Deno
      // edge functions (context/compliance/provenance-architecture.md §1).
      "@edge-shared": path.resolve(__dirname, "./supabase/functions/_shared"),
    },
  },
  build: {
    // The model-viewer feature is intrinsically about 1.03 MB minified and is
    // already isolated behind its lazy route. Keep the threshold just above
    // that known chunk so an accidentally swollen shared chunk still warns.
    chunkSizeWarningLimit: 1100,
    rolldownOptions: {
      output: {
        // Vite 8 / rolldown: the function form of `manualChunks` is deprecated
        // and — importantly — is NOT consulted for virtual modules. That let
        // Vite's `__vitePreload` helper (`\0vite/preload-helper.js`, needed by
        // the entry and by every chunk with a dynamic import) get folded into
        // whichever feature chunk claimed it first. It landed in `model-viewer`,
        // so the entry statically imported 1 MB of Simulacrum-only 3D code on
        // every single page load just to reach a ~1 kB function.
        //
        // `codeSplitting.groups` is the rolldown-native replacement and does see
        // virtual modules, so the helper below is pinned to its own chunk.
        // Groups are matched in order — first match wins — so the node_modules
        // catch-all stays last.
        codeSplitting: {
          groups: [
            // Shared dynamic-import helper — must never ride along with a
            // feature chunk (see above).
            { name: "preload-helper", test: /vite[\\/]preload-helper/ },
            // Vue ecosystem core. Order and `@vue[\\/]` are both load-bearing:
            // the runtime ships as @vue/*, so listed after tiptap (and without
            // that alternative) it was absorbed into the editor chunk, forcing
            // every chunk that needs Vue to import all 574 kB of tiptap.
            { name: "vue-core", test: /node_modules[\\/](@vue[\\/]|vue|pinia|@tanstack)/ },
            // 3D model viewer — Simulacrum only, keep it out of the main bundle.
            { name: "model-viewer", test: /node_modules[\\/]@google[\\/]model-viewer/ },
            // Quest graph engine — Build mode only.
            { name: "quest-flow", test: /node_modules[\\/]@vue-flow[\\/]/ },
            // Tiptap editor — loaded on any page with a rich text field
            { name: "tiptap", test: /node_modules[\\/](@tiptap|prosemirror)/ },
            // Document, date, and compatibility packages are substantial but
            // route-specific; do not fold them into catch-all vendor.
            { name: "documents", test: /node_modules[\\/](pdf-lib|@pdf-lib|pagedjs)/ },
            { name: "dates", test: /node_modules[\\/]date-fns/ },
            { name: "polyfills", test: /node_modules[\\/]core-js/ },
            // Babel's runtime helpers are shared across many packages. Left
            // unassigned, rolldown co-located them with their biggest consumer
            // (jspdf) inside the `pdf` chunk — and then `vendor` had to import
            // `_typeof` back out of it, making the entry statically depend on
            // all ~590 kB of PDF code. Pin them to `vendor` so the edge only
            // ever points the other way.
            { name: "vendor", test: /node_modules[\\/]@babel[\\/]runtime/ },
            // PDF/print — only needed in Card Forge and character-sheet export.
            { name: "pdf", test: /node_modules[\\/](jspdf|html2canvas)/ },
            // Visualisation — NPC relationship web only
            { name: "viz", test: /node_modules[\\/](d3|v-network-graph)/ },
            // Supabase client
            { name: "supabase", test: /node_modules[\\/]@supabase/ },
            // UI primitives (reka-ui + vueuse + icons + tw utils)
            {
              name: "ui",
              test: /node_modules[\\/](reka-ui|@vueuse|lucide-vue-next|class-variance-authority|clsx|tailwind-merge|tw-animate-css)/,
            },
            // Everything else from node_modules
            { name: "vendor", test: /node_modules/ },
          ],
        },
      },
    },
  },
}));
