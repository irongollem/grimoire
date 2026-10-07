/**
 * Critical-path report for a production build.
 *
 * "Critical path" = the entry <script type=module> plus every
 * <link rel=modulepreload> in index.html: the bytes the browser must fetch
 * before the app can start. Gzip total is the number story 0.4 gates CI on.
 *
 *   npx tsx scripts/perf/bundle/critical-path.ts [buildDir=dist] [--json out.json]
 */
import { readdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import path from "node:path";
import { brotliCompressSync, gzipSync } from "node:zlib";

export interface Sizes {
  raw: number;
  gzip: number;
  brotli: number;
}

export interface FileReport extends Sizes {
  file: string;
  onCriticalPath: boolean;
}

export interface Report {
  buildDir: string;
  entry: string;
  critical: FileReport[];
  criticalTotal: Sizes;
  largest: FileReport[];
}

/** Asset paths (relative to the build root, no leading slash) the HTML loads eagerly. */
export function parseCriticalAssets(html: string): { entry: string; preloads: string[] } {
  const strip = (href: string) => href.replace(/^\//, "");
  const attr = (tag: string, name: string): string | null => {
    const m = new RegExp(`\\s${name}="([^"]*)"`).exec(tag);
    return m ? m[1] : null;
  };
  let entry: string | null = null;
  for (const tag of html.match(/<script\b[^>]*>/g) ?? []) {
    const src = attr(tag, "src");
    if (src && attr(tag, "type") === "module") {
      entry = strip(src);
      break;
    }
  }
  if (entry === null) throw new Error("index.html has no <script type=module src=...> entry");
  const preloads: string[] = [];
  for (const tag of html.match(/<link\b[^>]*>/g) ?? []) {
    const href = attr(tag, "href");
    if (attr(tag, "rel") === "modulepreload" && href) preloads.push(strip(href));
  }
  return { entry, preloads: [...new Set(preloads)].filter((p) => p !== entry) };
}

export function sumSizes(items: readonly Sizes[]): Sizes {
  return items.reduce(
    (acc, s) => ({ raw: acc.raw + s.raw, gzip: acc.gzip + s.gzip, brotli: acc.brotli + s.brotli }),
    { raw: 0, gzip: 0, brotli: 0 },
  );
}

export function measure(content: Buffer): Sizes {
  return { raw: content.length, gzip: gzipSync(content).length, brotli: brotliCompressSync(content).length };
}

export function topBySize(files: readonly FileReport[], n: number): FileReport[] {
  return [...files].sort((a, b) => b.raw - a.raw).slice(0, n);
}

export function buildReport(buildDir: string): Report {
  const html = readFileSync(path.join(buildDir, "index.html"), "utf8");
  const { entry, preloads } = parseCriticalAssets(html);
  const criticalFiles = new Set([entry, ...preloads]);
  const measureFile = (file: string): FileReport => ({
    file,
    onCriticalPath: criticalFiles.has(file),
    ...measure(readFileSync(path.join(buildDir, file))),
  });
  const critical = [entry, ...preloads].map(measureFile);
  const assetsDir = path.join(buildDir, "assets");
  const all = readdirSync(assetsDir)
    .filter((f) => f.endsWith(".js") && statSync(path.join(assetsDir, f)).isFile())
    .map((f) => measureFile(`assets/${f}`));
  return {
    buildDir,
    entry,
    critical,
    criticalTotal: sumSizes(critical),
    largest: topBySize(all, 15),
  };
}

const kb = (n: number) => (n / 1024).toFixed(1).padStart(8);

export function formatReport(r: Report): string {
  const row = (f: FileReport) =>
    `${kb(f.raw)} ${kb(f.gzip)} ${kb(f.brotli)}  ${f.onCriticalPath ? "*" : " "} ${f.file}`;
  const head = "     raw     gzip   brotli  (KB)";
  const t = r.criticalTotal;
  return [
    `Critical path (${r.critical.length} files, entry ${r.entry})`,
    head,
    ...r.critical.map(row),
    `${kb(t.raw)} ${kb(t.gzip)} ${kb(t.brotli)}    TOTAL`,
    "",
    "15 largest chunks (* = on critical path)",
    head,
    ...r.largest.map(row),
  ].join("\n");
}

/** `[buildDir] [--json out.json]`, in either order; the build directory defaults to dist. */
export function parseArgs(argv: readonly string[]): { buildDir: string; jsonOut: string | null } {
  const jsonAt = argv.indexOf("--json");
  if (jsonAt < 0) return { buildDir: argv[0] ?? "dist", jsonOut: null };
  const jsonOut = argv[jsonAt + 1];
  if (jsonOut === undefined) throw new Error("--json needs a file path");
  const positional = argv.filter((_, i) => i !== jsonAt && i !== jsonAt + 1);
  return { buildDir: positional[0] ?? "dist", jsonOut };
}

function main(argv: string[]): void {
  const { buildDir, jsonOut } = parseArgs(argv);
  const report = buildReport(buildDir);
  console.log(formatReport(report));
  if (jsonOut) writeFileSync(jsonOut, `${JSON.stringify(report, null, 2)}\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv.slice(2));
}
