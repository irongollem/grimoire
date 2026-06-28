import { defineConfig, type Plugin } from "vite";
import type { ViteSSGOptions as _ViteSSGOptions } from "vite-ssg";
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

export default defineConfig({
  plugins: [
    vue(),
    tailwindcss(),
    swPlugin(),
  ],
  ssgOptions: {
    // Only pre-render public marketing + legal routes — all auth-required app routes stay SPA.
    includedRoutes(paths: string[]) {
      return paths.filter((p) => ["/", "/pricing", "/privacy", "/terms", "/refunds"].includes(p));
    },
  },
  server: {
    // Portless injects PORT so its proxy can reach the dev server.
    // Falls back to 5173 for plain `npm run dev`.
    port: parseInt(process.env.PORT ?? "5173"),
    strictPort: true,
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks(id) {
          // Tiptap editor — loaded on any page with a rich text field
          if (id.includes("node_modules/@tiptap") || id.includes("node_modules/prosemirror")) {
            return "tiptap";
          }
          // PDF/print — only needed in Card Forge
          if (id.includes("node_modules/jspdf") || id.includes("node_modules/html2canvas")) {
            return "pdf";
          }
          // Visualisation — NPC relationship web only
          if (id.includes("node_modules/d3") || id.includes("node_modules/v-network-graph")) {
            return "viz";
          }
          // Supabase client
          if (id.includes("node_modules/@supabase")) {
            return "supabase";
          }
          // UI primitives (radix + vueuse + icons + tw utils)
          if (
            id.includes("node_modules/radix-vue") ||
            id.includes("node_modules/@vueuse") ||
            id.includes("node_modules/lucide-vue-next") ||
            id.includes("node_modules/class-variance-authority") ||
            id.includes("node_modules/clsx") ||
            id.includes("node_modules/tailwind-merge") ||
            id.includes("node_modules/tw-animate-css")
          ) {
            return "ui";
          }
          // Vue ecosystem core
          if (
            id.includes("node_modules/vue") ||
            id.includes("node_modules/vue-router") ||
            id.includes("node_modules/pinia") ||
            id.includes("node_modules/@tanstack")
          ) {
            return "vue-core";
          }
          // Everything else from node_modules
          if (id.includes("node_modules")) {
            return "vendor";
          }
        },
      },
    },
  },
});
