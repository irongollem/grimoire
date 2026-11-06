#!/usr/bin/env tsx
/**
 * Predicts each journey's `codeRequests` from a production build, so a chunk
 * budget breach shows up in `/ship` instead of in CI's browser run.
 *
 * The browser harness (scripts/perf/run.ts) needs a local Supabase stack and
 * Chromium, minutes a ship gate cannot spend. But the code a page fetches is
 * written into the build: `index.html` names the boot files, and every lazy
 * `import()` carries Vite's preload list (`__vite__mapDeps`), the chunk with
 * every JS and CSS file it needs. So a step's code files are the boot files
 * (on a cold load) plus the preload lists of the lazy chunks it opens (its
 * roots), less what an earlier step already loaded. The usual breach, a shared
 * chunk crossing the 8 kB inline threshold (#1149, Awareness Rolls), shows up
 * as a new file in a root's preload list.
 *
 * What the model cannot see is a journey starting to open a NEW lazy chunk:
 * the roots come from a real run (journey-code.json). CI's performance job
 * compares this prediction with what the browser measured and warns when they
 * part, with the command to refresh the roots from that run's artifact.
 *
 *   npx tsx scripts/perf/bundle/journey-code.ts [dist]                  check against budgets.json
 *   npx tsx scripts/perf/bundle/journey-code.ts [dist] --against <ci.json>   compare with a measured run
 *   npx tsx scripts/perf/bundle/journey-code.ts [dist] --roots-from <ci.json> rewrite journey-code.json
 */
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { isCliEntry } from "../../lib/cli";
import type { Budgets } from "../budgets";
import type { ResultsFile } from "../results";

const SPEC_PATH = path.join(import.meta.dirname, "..", "journey-code.json");
const BUDGETS_PATH = path.join(import.meta.dirname, "..", "budgets.json");

export interface BuildGraph {
  /** Files index.html loads itself: the module entry, its modulepreloads and stylesheets (asset file names). */
  boot: Set<string>;
  /** Lazy chunk file -> every file its preload list fetches with it, itself included. */
  lazy: Map<string, Set<string>>;
}

export interface StepSpec {
  /** Steps whose files are already in the page when this one starts ("journey/label"), in order. */
  after: string[];
  /** Hash-free names of the lazy chunks the step opens. */
  roots: string[];
  /** Code fetched from outside the build (Vercel's analytics scripts), counted as it is. */
  external: string[];
  /** Hash-free names of the build files the step fetched in the run the spec came from, so a breach can name what is new. */
  files: string[];
}

export type JourneySpec = Record<string, StepSpec>;

/** `DashboardView-CSLmC7y9.js` -> `DashboardView.js`: the name that survives a rebuild. */
export function stableName(file: string): string {
  return path.basename(file).replace(/-[A-Za-z0-9_-]{8}\.(js|css)$/, ".$1");
}

/** The asset files index.html fetches by itself. */
export function parseBoot(html: string): Set<string> {
  const boot = new Set<string>();
  for (const match of html.matchAll(/<(?:script|link)\b[^>]*\s(?:src|href)="\/assets\/([^"]+\.(?:js|css))"/g)) boot.add(match[1]);
  return boot;
}

/**
 * Every lazy `import()` in one chunk, with the files its preload list names.
 *
 * Vite writes the list once per chunk (`m.f||(m.f=["assets/a.js",...])`) and
 * each call indexes into it: `import(\`./X.js\`)...,__vite__mapDeps([0,3])`.
 * An import with no list (nothing to preload) fetches the chunk alone.
 */
export function parseLazyImports(source: string): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  const table = /m\.f\|\|\(m\.f=\[([^\]]*)\]/.exec(source);
  const files = table === null ? [] : table[1].split(",").map((entry) => entry.trim().replace(/^"|"$/g, "").replace(/^assets\//, ""));
  const calls = [...source.matchAll(/import\([`"']\.\/([^`"']+\.js)[`"']\)/g)];
  calls.forEach((call, i) => {
    const target = call[1];
    const end = i + 1 < calls.length ? calls[i + 1].index : source.length;
    const between = source.slice(call.index, end);
    const deps = new Set<string>([target]);
    const list = /__vite__mapDeps\(\[([0-9,]*)\]\)/.exec(between);
    if (list !== null) {
      for (const index of list[1].split(",").filter(Boolean)) {
        const file = files[Number(index)];
        if (file === undefined) throw new Error(`preload index ${index} is outside its chunk's table (${files.length} entries)`);
        deps.add(file);
      }
    }
    const known = out.get(target);
    out.set(target, known === undefined ? deps : new Set([...known, ...deps]));
  });
  return out;
}

export function readBuild(buildDir: string): BuildGraph {
  const assets = path.join(buildDir, "assets");
  const lazy = new Map<string, Set<string>>();
  for (const file of readdirSync(assets)) {
    if (!file.endsWith(".js")) continue;
    for (const [target, deps] of parseLazyImports(readFileSync(path.join(assets, file), "utf8"))) {
      const known = lazy.get(target);
      lazy.set(target, known === undefined ? deps : new Set([...known, ...deps]));
    }
  }
  return { boot: parseBoot(readFileSync(path.join(buildDir, "index.html"), "utf8")), lazy };
}

/**
 * The build files a step needs, before subtracting what earlier steps loaded.
 * The boot files are always among them: a later step starts after one that
 * loaded them, so the subtraction drops them there. A name two chunks share
 * opens both.
 */
function stepFiles(graph: BuildGraph, step: StepSpec): { files: Set<string>; unknownRoots: string[] } {
  const byName = new Map<string, string[]>();
  for (const target of graph.lazy.keys()) byName.set(stableName(target), [...(byName.get(stableName(target)) ?? []), target]);
  const files = new Set<string>(graph.boot);
  const unknownRoots: string[] = [];
  for (const root of step.roots) {
    const targets = byName.get(root);
    if (targets === undefined) {
      unknownRoots.push(root);
      continue;
    }
    for (const target of targets) for (const file of graph.lazy.get(target) ?? []) files.add(file);
  }
  return { files, unknownRoots };
}

export interface Prediction {
  step: string;
  codeRequests: number;
  /** Hash-free names of the build files the step fetches, sorted. */
  files: string[];
  /** Roots the build no longer has as a lazy chunk: renamed or inlined, so the spec needs refreshing. */
  unknownRoots: string[];
}

export function predict(graph: BuildGraph, spec: JourneySpec): Prediction[] {
  const loaded = new Map<string, Set<string>>();
  const out: Prediction[] = [];
  for (const [key, step] of Object.entries(spec)) {
    const already = new Set<string>();
    for (const prior of step.after) {
      const files = loaded.get(prior);
      if (files === undefined) throw new Error(`${key} comes after ${prior}, which is not listed before it`);
      for (const file of files) already.add(file);
    }
    const { files, unknownRoots } = stepFiles(graph, step);
    const fresh = [...files].filter((file) => !already.has(file));
    loaded.set(key, new Set([...already, ...files]));
    out.push({ step: key, codeRequests: fresh.length + step.external.length, files: fresh.map(stableName).sort(), unknownRoots });
  }
  return out;
}

export interface Verdict {
  step: string;
  predicted: number;
  budget: number | null;
}

/** Names in `now` and not in `then`, and the reverse, counting a name each time it occurs. */
export function nameDiff(then: string[], now: string[]): { added: string[]; removed: string[] } {
  const count = (names: string[]) => names.reduce((m, n) => m.set(n, (m.get(n) ?? 0) + 1), new Map<string, number>());
  const a = count(then);
  const b = count(now);
  const extra = (x: Map<string, number>, y: Map<string, number>) =>
    [...x].flatMap(([name, n]) => Array<string>(Math.max(0, n - (y.get(name) ?? 0))).fill(name)).sort();
  return { added: extra(b, a), removed: extra(a, b) };
}

/** Steps predicted over their codeRequests ceiling (the CI gate's failure), and under it (lower the budget). */
export function judge(predictions: Prediction[], budgets: Budgets): { over: Verdict[]; under: Verdict[]; unbudgeted: string[] } {
  const over: Verdict[] = [];
  const under: Verdict[] = [];
  const unbudgeted: string[] = [];
  for (const { step, codeRequests } of predictions) {
    const [journey, ...label] = step.split("/");
    const budget: unknown = budgets.journeys[journey]?.[label.join("/")]?.codeRequests;
    if (typeof budget !== "number") {
      unbudgeted.push(step);
      continue;
    }
    if (codeRequests > budget) over.push({ step, predicted: codeRequests, budget });
    else if (codeRequests < budget) under.push({ step, predicted: codeRequests, budget });
  }
  return { over, under, unbudgeted };
}

/**
 * The page state each journey starts from, mirroring journeys.ts: dm-nav,
 * dm-npc-detail and resume open the dashboard first (primeDashboard), and
 * dm-npc-detail also opens /npcs before it measures. A later step of the same
 * journey follows the steps before it.
 */
const PRIMED_BY: Record<string, string[]> = {
  "dm-nav": ["dm-cold/dm-cold"],
  "dm-npc-detail": ["dm-cold/dm-cold", "dm-nav//npcs"],
  resume: ["dm-cold/dm-cold"],
};

const CODE_PATH = /\.(js|css)$/;

/** A spec from a measured run: each step's roots are the lazy chunks it fetched. */
export function specFromRun(results: ResultsFile, graph: BuildGraph): JourneySpec {
  const lazyNames = new Set([...graph.lazy.keys()].map(stableName));
  const spec: JourneySpec = {};
  // dm-cold first: the primed journeys refer to it.
  const order = [...results.journeys].sort((a, b) => Number(b.journey === "dm-cold") - Number(a.journey === "dm-cold"));
  for (const journey of order) {
    if (journey.status !== "ok") continue;
    const earlier: string[] = [];
    for (const step of journey.steps) {
      const run = step.runs[0];
      if (run === undefined) continue;
      const code = run.assetPaths.filter((p) => CODE_PATH.test(p));
      const key = `${journey.journey}/${step.label}`;
      spec[key] = {
        after: [...(PRIMED_BY[journey.journey] ?? []), ...earlier],
        roots: [...new Set(code.filter((p) => p.startsWith("/assets/")).map(stableName))].filter((n) => lazyNames.has(n)).sort(),
        external: code.filter((p) => !p.startsWith("/assets/")).sort(),
        files: code.filter((p) => p.startsWith("/assets/")).map(stableName).sort(),
      };
      earlier.push(key);
    }
  }
  return spec;
}

/** Where the model and a measured run disagree. */
export function compareWithRun(predictions: Prediction[], results: ResultsFile): string[] {
  const out: string[] = [];
  for (const { step, codeRequests } of predictions) {
    const [journey, ...label] = step.split("/");
    const measured = results.journeys.find((j) => j.journey === journey)?.steps.find((s) => s.label === label.join("/"))?.median.codeRequests;
    if (typeof measured === "number" && measured !== codeRequests) out.push(`${step}: model ${codeRequests}, measured ${measured}`);
  }
  return out;
}

function readJson<T>(file: string): T {
  return JSON.parse(readFileSync(file, "utf8")) as T;
}

function main(argv: string[]): number {
  const flag = (name: string): string | null => {
    const i = argv.indexOf(name);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  const buildDir = argv[0] !== undefined && !argv[0].startsWith("--") ? argv[0] : "dist";
  const graph = readBuild(buildDir);

  const rootsFrom = flag("--roots-from");
  if (rootsFrom !== null) {
    const results = readJson<ResultsFile>(rootsFrom);
    const spec = specFromRun(results, graph);
    writeFileSync(SPEC_PATH, `${JSON.stringify(spec, null, 2)}\n`);
    const drift = compareWithRun(predict(graph, spec), results);
    console.log(`wrote ${path.relative(process.cwd(), SPEC_PATH)} (${Object.keys(spec).length} steps)`);
    // Only meaningful when the build is the commit the run measured.
    for (const line of drift) console.log(`  differs from the run: ${line}`);
    return 0;
  }

  const spec = readJson<JourneySpec>(SPEC_PATH);
  const predictions = predict(graph, spec);
  const against = flag("--against");
  if (against !== null) {
    const drift = compareWithRun(predictions, readJson<ResultsFile>(against));
    if (drift.length === 0) {
      console.log("journey-code: the model matches the measured run");
      return 0;
    }
    // A warning, not a failure: the real gate is the measured run itself.
    console.log(`::warning::journey-code.json no longer models the journeys (${drift.join("; ")}). Refresh it from this run's perf-journeys artifact: npx tsx scripts/perf/bundle/journey-code.ts dist --roots-from ci.json`);
    return 0;
  }

  const { over, under, unbudgeted } = judge(predictions, readJson<Budgets>(BUDGETS_PATH));
  for (const p of predictions) {
    if (p.unknownRoots.length > 0) console.log(`  ${p.step}: no lazy chunk named ${p.unknownRoots.join(", ")} any more; refresh journey-code.json from the next CI run`);
  }
  for (const s of unbudgeted) console.log(`  ${s}: no codeRequests budget`);
  for (const v of under) console.log(`  ${v.step}: ${v.predicted} code files, budget ${v.budget}; lower codeRequests in scripts/perf/budgets.json`);
  if (over.length === 0) {
    console.log(`journey-code: every journey within its codeRequests budget (${predictions.length} steps)`);
    return 0;
  }
  for (const v of over) {
    console.log(`OVER BUDGET ${v.step}: ${v.predicted} code files, budget ${v.budget}`);
    const now = predictions.find((p) => p.step === v.step)?.files ?? [];
    const { added, removed } = nameDiff(spec[v.step].files, now);
    if (added.length > 0) console.log(`  new since the measured run: ${added.join(", ")}`);
    if (removed.length > 0) console.log(`  gone since the measured run: ${removed.join(", ")}`);
  }
  console.log(
    "A new file is usually a shared chunk that crossed the 8 kB inline threshold, or a page that gained an import. " +
      "Keep it off the page, or raise codeRequests in scripts/perf/budgets.json with the reason in its $comment.",
  );
  return 1;
}

if (isCliEntry(import.meta.url)) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}
