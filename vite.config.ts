import { defineConfig, loadEnv, type Plugin } from "vite";
import vue from "@vitejs/plugin-vue";
import tailwindcss from "@tailwindcss/vite";
import { sentryVitePlugin } from "@sentry/vite-plugin";
import { visualizer } from "rollup-plugin-visualizer";
import path from "path";
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync } from "node:fs";
import { createHash } from "node:crypto";

/**
 * Hand-rolled service worker builder.
 *
 * After `closeBundle` (when Vite has finished writing `dist/`), derives the
 * precache manifest, hashes the concatenated filename+size list to get a
 * cache-busting name, and substitutes both into `scripts/sw-template.js`
 * before writing the final `dist/sw.js`. The template itself never ships —
 * it's read off disk at build time only.
 *
 * PRECACHE THE SHELL, NOT THE BUILD. This used to walk all of `dist/` and
 * precache every file under 3 MB, which meant a first visit downloaded
 * **36.4 MB** before the app was usable: 26.1 MB of art (150 files — every
 * sheet plate, every Cardforge deck back, every Scriptorium watercolour) and
 * 9.8 MB across 449 JS chunks. Someone who never printed a sheet or opened
 * Cardforge paid for all of it.
 *
 * The JS half was the worse bug, because it silently undid work done
 * elsewhere: `model-viewer` (0.98 MB), `documents` (0.97 MB) and `pdf`
 * (0.57 MB) are lazy routes, and `useCharacterSheetPdf` goes out of its way
 * to import jspdf + html2canvas only "once a user actually exports a sheet".
 * Precaching every emitted chunk fetched them on install anyway, so the code
 * splitting bought nothing. A route-level lazy import is worthless if the
 * service worker downloads the chunk before anyone asks for it.
 *
 * So the precache is now exactly the boot shell — what `index.html` itself
 * references — and everything else is cached at runtime on first real use
 * (see `scripts/sw-template.js`). That is ~2.3 MB rather than 36.4 MB. The
 * cost is honest and bounded: offline, a route the user has never visited is
 * unavailable until they open it once online. Booting offline still works.
 *
 * Replaces vite-plugin-pwa, which was the only blocker keeping us on
 * vite@^7 (its peer dep range caps there and the package has been stale
 * for 5 months with no vite 8 support).
 */
function swPlugin(): Plugin {
  /**
   * Ceiling for the whole precache. Not a tuning knob — a tripwire. The old
   * policy decayed silently because nothing failed as the number grew; a
   * budget that breaks the build is the only kind that survives. Raise it
   * deliberately, with a reason, or move the asset out of the boot path.
   */
  const SHELL_BUDGET_BYTES = 4 * 1024 * 1024;

  /**
   * The shell is what `index.html` asks the browser for in order to boot:
   * the entry script, its static modulepreloads, the stylesheets, the
   * favicons and the manifest.
   *
   * Selected by `rel`, deliberately, rather than by size. `apple-touch-icon`
   * is the reason: it is referenced from `index.html` like everything else
   * here and is 2.56 MB (1024x1024, where iOS asks for 180x180 — see #864),
   * so a size filter would drop it for the right outcome and the wrong
   * reason, and would silently re-admit it the day someone resized it. It is
   * home-screen art the OS fetches when a user installs the app; it has no
   * part in booting, so it is excluded by role and cached at runtime if it is
   * ever actually requested.
   */
  const SHELL_LINK_RELS = new Set(["modulepreload", "preload", "stylesheet", "icon", "manifest"]);

  function shellFromIndexHtml(html: string): string[] {
    // index.html is not referenced by itself, but it is the navigation
    // fallback the fetch handler serves offline, so it is always in.
    const refs = new Set<string>(["/index.html"]);

    for (const [, src] of html.matchAll(/<script\b[^>]*\bsrc="(\/[^"]+)"/gi)) {
      refs.add(src);
    }
    for (const [, tag] of html.matchAll(/<link\b([^>]*)>/gi)) {
      const rel = tag.match(/\brel="([^"]+)"/i)?.[1]?.toLowerCase().trim();
      const href = tag.match(/\bhref="(\/[^"]+)"/i)?.[1];
      if (!rel || !href) continue;
      // `rel` may carry multiple space-separated tokens ("icon shortcut").
      if (rel.split(/\s+/).some((token) => SHELL_LINK_RELS.has(token))) refs.add(href);
    }
    return [...refs].sort();
  }

  /**
   * Everything copied verbatim out of `public/`, as served paths.
   *
   * The service worker needs this to tell an immutable asset from a mutable
   * one, and the filename cannot answer that question. Vite's content hash
   * looks like `-DXiZtau7.webp`, but `public/assets/cardforge/loot-backs/
   * dragons-watch-tc.webp` matches any `-[8 chars].ext` rule too, as do
   * `alchemists-wheel-tc.webp` and `scriptorium/corder-ornament.webp`. The
   * build already knows the answer exactly, so it passes it down instead of
   * making the worker guess.
   *
   * This also fixes a latent bug in the worker's copy-forward path, which
   * treated every `/assets/` URL as content-hashed: a changed public file
   * that kept its name was copied forward from the previous deploy's cache
   * forever.
   */
  function walkPublic(root: string, prefix = ""): string[] {
    const result: string[] = [];
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const full = path.join(root, entry.name);
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      if (entry.isDirectory()) result.push(...walkPublic(full, rel));
      else result.push("/" + rel);
    }
    return result;
  }

  return {
    name: "grimoire-sw",
    apply: "build",
    closeBundle() {
      const distDir  = path.resolve(import.meta.dirname, "dist");
      const template = readFileSync(
        path.resolve(import.meta.dirname, "scripts/sw-template.js"),
        "utf8",
      );

      const html = readFileSync(path.join(distDir, "index.html"), "utf8");
      const files = shellFromIndexHtml(html).filter((f) =>
        existsSync(path.join(distDir, f.slice(1))),
      );
      const mutable = walkPublic(path.resolve(import.meta.dirname, "public")).sort();

      // Hash the filename list + sizes so any shell change bumps the cache
      // name, forcing clients to refetch it on the next deploy. Runtime-cached
      // assets are content-hashed (immutable) or revalidated in the
      // background, so neither needs to participate in this.
      const hasher = createHash("sha256");
      let shellBytes = 0;
      for (const f of files) {
        const size = statSync(path.join(distDir, f.slice(1))).size;
        shellBytes += size;
        hasher.update(f);
        hasher.update(String(size));
      }
      const cacheName = "grimoire-" + hasher.digest("hex").slice(0, 8);

      if (shellBytes > SHELL_BUDGET_BYTES) {
        const mb = (n: number) => (n / 1024 / 1024).toFixed(1) + " MB";
        throw new Error(
          `service-worker shell is ${mb(shellBytes)}, over the ${mb(SHELL_BUDGET_BYTES)} budget. ` +
            `Every first visit pays this before the app is usable. Move the asset out of index.html's ` +
            `boot path so it is cached on demand, or raise SHELL_BUDGET_BYTES in vite.config.ts with a reason.`,
        );
      }

      // replaceAll — the template's doc comment mentions the placeholder
      // tokens before the code uses them, so first-occurrence replace would
      // rewrite the comment and leave the real const declarations untouched.
      const sw = template
        .replaceAll("__PRECACHE__",   JSON.stringify(files))
        .replaceAll("__MUTABLE__",    JSON.stringify(mutable))
        .replaceAll("__CACHE_NAME__", cacheName);
      writeFileSync(path.join(distDir, "sw.js"), sw);

      this.info?.(
        `SW built: ${files.length} precached (${(shellBytes / 1024 / 1024).toFixed(1)} MB shell), ` +
          `${mutable.length} mutable, cache=${cacheName}`,
      );
    },
  };
}

export default defineConfig(({ mode }) => {
  /**
   * Source-map upload for error tracking (#644).
   *
   * Read through `loadEnv` rather than `process.env` alone so a local
   * `npm run build` picks the token up from the gitignored `.env.local` and can
   * verify the upload before anything is pushed. On Vercel — which is where the
   * production frontend actually builds, so this is the run that matters — it
   * comes from the project's environment variables instead. Unset anywhere
   * else, and then no maps are generated and no upload is attempted.
   */
  const sentryAuthToken = loadEnv(mode, import.meta.dirname, "SENTRY_").SENTRY_AUTH_TOKEN;

  // Sentry pairs an event with the right source maps by debug id, so this is
  // only the human-readable label on the release. Empty off-Vercel.
  const release = process.env.VERCEL_GIT_COMMIT_SHA ?? "";

  return {
    // Root .env.local intentionally contains hosted credentials and Vite loads
    // it after .env.<mode>. Isolate localdb mode in its own env directory so
    // hosted values cannot silently win on precedence.
    envDir: mode === "localdb" ? path.resolve(import.meta.dirname, "config/env/localdb") : undefined,
    define: {
      __SENTRY_RELEASE__: JSON.stringify(release),
      __SENTRY_ENVIRONMENT__: JSON.stringify(process.env.VERCEL_ENV ?? "development"),
      // Sentry's own tree-shaking flags. We run errors-only (no tracing, and
      // `tracesSampleRate: 0`), so the tracing code is dead weight the bundler
      // cannot prove is unreachable on its own. Debug logging likewise.
      __SENTRY_TRACING__: JSON.stringify(false),
      __SENTRY_DEBUG__: JSON.stringify(false),
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
      // Last: it needs the finished bundle. Skipped entirely without a token, so
      // `npm run build` stays a zero-configuration command for contributors and
      // for the CI gate in test.yml (which builds only to prove the build works
      // — a PR branch has no business minting production releases).
      ...(sentryAuthToken
        ? [
            sentryVitePlugin({
              authToken: sentryAuthToken,
              // Hardcoded rather than read from env: they are not secret, and a
              // missing env var here would fail *silently* by uploading nothing.
              org: "crocode-bv",
              project: "dungeon-grimoire",
              release: { name: release || undefined },
              // The maps are uploaded and then deleted from `dist/`, so they are
              // never served — Sentry un-minifies, the public never sees source.
              sourcemaps: { filesToDeleteAfterUpload: ["./dist/**/*.map"] },
            // Expect exactly three "could not determine a source map
            // reference" warnings, for `_plugin-vue_export-helper`,
            // `preload-helper` and `rolldown-runtime`. Checked: those are the
            // only three of 410 chunks with no `.map` sidecar, because they are
            // generated glue with no original source — 2.2 kB in total. There
            // is nothing to map and nothing to fix; a *fourth* name appearing
            // in that list is the thing worth looking at.
              telemetry: false,
              // A failed upload must never fail a deploy. The worst case is one
              // release with minified stack traces; taking the whole frontend
              // down over it would be the more expensive outage by far.
              errorHandler: (err) => {
                console.warn(`::warning::Sentry source-map upload failed: ${err.message}`);
              },
            }),
          ]
        : []),
      // Bundle profiler — off unless `npm run analyze` sets ANALYZE=1, so the
      // production build and the CI gate are byte-identical with and without it.
      // Writes dist/stats.html (gitignored); `treemap` answers "what is big",
      // gzip/brotli sizes answer "what is big *over the wire*", which is the
      // number that actually decides whether a chunk needs splitting.
      ...(process.env.ANALYZE
        ? [
            visualizer({
              filename: "dist/stats.html",
              template: "treemap",
              gzipSize: true,
              brotliSize: true,
              open: true,
            }) as Plugin,
          ]
        : []),
    ],
    server: {
      // Portless injects PORT so its proxy can reach the dev server.
      // Falls back to 5173 for plain `npm run dev`.
      port: parseInt(process.env.PORT ?? "5173"),
      strictPort: true,
    },
    resolve: {
      alias: {
        "@": path.resolve(import.meta.dirname, "./src"),
        // Canonical AI-provenance core is pure TS shared verbatim with the Deno
        // edge functions (context/compliance/provenance-architecture.md §1).
        "@edge-shared": path.resolve(import.meta.dirname, "./supabase/functions/_shared"),
      },
    },
    build: {
      // "hidden" emits the maps but omits the `//# sourceMappingURL` comment, so
      // the browser never fetches them and the bundle stays effectively closed
      // to a reader — Sentry resolves them by debug id instead. Paired with
      // `filesToDeleteAfterUpload`, the maps exist only between the end of the
      // build and the end of the upload.
      sourcemap: sentryAuthToken ? ("hidden" as const) : false,
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
              // Error tracking. Pinned to its own chunk for the same reason as
            // the preload helper above: left to the `node_modules` catch-all it
            // lands in `vendor`, and the resulting reshuffle pulled `tiptap`,
            // `dates` and `polyfills` from lazy into the entry's static graph —
            // a measured +311 kB gzip on first load for a 31 kB library.
            // Measured, not guessed: initial JS is 325 kB gzip without error
            // tracking, 357 kB with it pinned here, and 636 kB with it left in
            // `vendor`. Re-measure by summing the gzip size of every script and
            // modulepreload in `dist/index.html` before changing this line.
            { name: "sentry", test: /node_modules[\\/]@sentry/ },
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
                test: /node_modules[\\/](reka-ui|@vueuse|@lucide[\\/]vue|class-variance-authority|clsx|tailwind-merge|tw-animate-css)/,
              },
              // Everything else from node_modules
              { name: "vendor", test: /node_modules/ },
            ],
          },
        },
      },
    },
  };
});
