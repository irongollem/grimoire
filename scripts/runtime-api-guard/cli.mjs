#!/usr/bin/env node
/**
 * runtime-api-guard — fail the build when the bundle starts using a runtime
 * API the browsers we claim to support do not have.
 *
 * ── Why this exists ─────────────────────────────────────────────────────────
 *
 * `TypeError: Object.hasOwn is not a function` took app.dungeongrimoire.com/login
 * down (#896). Vue's errorHandler swallowed it, so the sign-in button simply
 * did nothing. Every gate was green: `build.target` transpiles *syntax*, and
 * these are *runtime* methods on built-in objects, so no target setting ever
 * emits a fallback for one. vue-tsc, oxlint, vitest and `vite build` all run
 * on Node, which has every one of them. The only signal was a production
 * stack trace from a user who could not get in.
 *
 * Four of the five APIs that break in that situation live in dependencies, not
 * in src/ — reka-ui, @vue/runtime-core, `marked`, @vuepic/vue-datepicker. That
 * is why Babel is not the answer here: `@babel/preset-env`'s
 * `useBuiltIns: "usage"` analyses your own source, not pre-bundled
 * node_modules, so it would have missed the exact call that broke production.
 * This reads the emitted bundle instead, where the dependency code actually is.
 *
 * ── Why it gates on names, not counts ───────────────────────────────────────
 *
 * The first version of this was a text search, and three of its six findings
 * were wrong: it read `1e3/d` as a regex `d` flag, it did not know that
 * vue-core merely *defines* `toSorted` on its reactive-array instrumentation,
 * and it could not see that model-viewer feature-detects `AbortSignal.any`.
 * A gate that cries wolf gets switched off, which is worse than no gate.
 *
 * So: parse rather than grep, and compare the detected *set of names* against
 * an approved list that records why each one is safe (`pinned.mjs`). A new
 * name fails the build, because nobody has ruled on it. A known name stays
 * silent however many times it appears. False positives therefore cost one
 * triage each, permanently, instead of one per build forever. The same
 * discipline as supabase/tests/anon_rpc_surface.test.sql, which pins the set
 * of anon-reachable RPCs so a sixth cannot arrive unnoticed.
 *
 * ── Why it scans every chunk, not the boot path ─────────────────────────────
 *
 * Learned the hard way, one ticket earlier. `bootBudgetPlugin` was calibrated
 * against `npm run build` when what ships is `vercel build --prod`; the two
 * produce different chunk groupings (38 files vs 28), the ceiling landed below
 * the real payload, and the release job failed on every push to main until it
 * was corrected (#899).
 *
 * This check is built to be immune to that class of error. Regrouping moves
 * code between files; it does not change which code exists. Scanning the union
 * of every emitted chunk therefore gives the same answer under either command,
 * so there is no number to calibrate and no privileged build to measure. A
 * lazy route that crashes on an old phone is a crash either way, so the union
 * is also the set we actually care about.
 *
 * Usage:  node scripts/runtime-api-guard/cli.mjs          # gate
 *         node scripts/runtime-api-guard/cli.mjs --list   # print the detected
 *                                                         # set, for refreshing
 *                                                         # pinned.mjs
 */
import { readFileSync, readdirSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { detectApis, compareToPinned } from "./core.mjs";
import { PINNED } from "./pinned.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const assetsDir = path.join(repoRoot, "dist", "assets");

function scanBundle() {
  if (!existsSync(assetsDir)) {
    throw new Error(
      `no build to check — ${path.relative(repoRoot, assetsDir)} does not exist. Run \`npm run build\` first.`,
    );
  }

  const files = readdirSync(assetsDir).filter((file) => file.endsWith(".js"));
  if (files.length === 0) throw new Error(`no .js chunks in ${assetsDir}`);

  const detected = new Set();
  /** name -> chunks it appears in, so a failure says where to look. */
  const sites = new Map();

  for (const file of files) {
    let found;
    try {
      found = detectApis(readFileSync(path.join(assetsDir, file), "utf8"));
    } catch (cause) {
      // Never skip a chunk that will not parse. A checker that quietly drops
      // input reports a clean bill of health about a partial read.
      throw new Error(`could not parse dist/assets/${file}: ${cause.message}`, { cause });
    }
    for (const name of found) {
      detected.add(name);
      const chunk = file.replace(/-[A-Za-z0-9_-]{8}\.js$/, ".js");
      if (!sites.has(name)) sites.set(name, new Set());
      sites.get(name).add(chunk);
    }
  }

  return { detected, sites, fileCount: files.length };
}

const { detected, sites, fileCount } = scanBundle();

if (process.argv.includes("--list")) {
  for (const name of [...detected].sort()) {
    console.log(`${name}  <- ${[...sites.get(name)].sort().slice(0, 4).join(", ")}`);
  }
  process.exit(0);
}

const { added, stale } = compareToPinned(detected, Object.keys(PINNED));

console.log(
  `runtime-api-guard: ${detected.size} post-Safari-15.0 APIs across ${fileCount} chunks, ` +
    `${Object.keys(PINNED).length} approved`,
);

// Stale entries are reported but do not fail. A name that has *left* the
// bundle cannot break anyone's browser, and failing on it would put this check
// in the way of routine dependency updates for no safety gain. The asymmetry
// is deliberate: the dangerous direction is the one that fails.
if (stale.length > 0) {
  console.log(
    `\nnote: ${stale.length} approved ${stale.length === 1 ? "entry is" : "entries are"} no longer ` +
      `in the bundle and can be deleted from pinned.mjs:\n  ${stale.join("\n  ")}`,
  );
}

if (added.length > 0) {
  const detail = added
    .map((name) => `  ${name}\n      in ${[...sites.get(name)].sort().slice(0, 5).join(", ")}`)
    .join("\n");
  console.error(
    `\nruntime-api-guard: ${added.length} unapproved runtime ${added.length === 1 ? "API" : "APIs"} ` +
      `in the bundle:\n\n${detail}\n\n` +
      `Each one throws on a browser older than the API, and no build target polyfills it — that is\n` +
      `how #896 took the login screen down. For each name, do one of:\n\n` +
      `  1. Polyfill it in src/lib/polyfills, then add it to pinned.mjs saying so.\n` +
      `  2. Establish it is already safe — feature-detected at the call site, or only reachable\n` +
      `     from code that never runs — and add it to pinned.mjs with that reason.\n` +
      `  3. Stop using it.\n\n` +
      `Read the call site before choosing: prototype-method detections over-report by design\n` +
      `(\`thing.at()\` may be nobody's Array), and recording that is itself a valid outcome.`,
  );
  process.exit(1);
}

console.log("runtime-api-guard: no unapproved APIs");
