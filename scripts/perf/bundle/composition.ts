/**
 * Answers "what is the entry chunk made of, and why does it reach tiptap?"
 * from the visualizer's raw-data output.
 *
 *   SENTRY_AUTH_TOKEN= ANALYZE=json ANALYZE_OUT=dist-bundle \
 *     npx vite build --outDir dist-bundle --emptyOutDir
 *   npx tsx scripts/perf/bundle/composition.ts [dist-bundle/stats.json] [pattern-for-target]
 */
import { readFileSync } from "node:fs";
import path from "node:path";

interface Edge {
  uid: string;
  dynamic?: boolean;
}
interface NodePart {
  renderedLength: number;
  gzipLength: number;
  brotliLength: number;
  metaUid: string;
}
interface NodeMeta {
  id: string;
  moduleParts: Record<string, string>;
  imported: Edge[];
  importedBy: Edge[];
}
export interface Stats {
  nodeParts: Record<string, NodePart>;
  nodeMetas: Record<string, NodeMeta>;
}

/** Rendered bytes each module contributes to one chunk, largest first. */
export function modulesInChunk(stats: Stats, chunk: string): { id: string; rendered: number; gzip: number }[] {
  const out: { id: string; rendered: number; gzip: number }[] = [];
  for (const meta of Object.values(stats.nodeMetas)) {
    const partUid = meta.moduleParts[chunk];
    if (partUid === undefined) continue;
    const part = stats.nodeParts[partUid];
    out.push({ id: meta.id, rendered: part.renderedLength, gzip: part.gzipLength });
  }
  return out.sort((a, b) => b.rendered - a.rendered);
}

/** Shortest chain of STATIC imports from `startId` to the first module matching `target`. */
export function staticChain(stats: Stats, startId: string, target: RegExp): string[] | null {
  const byId = new Map<string, string>();
  for (const [uid, m] of Object.entries(stats.nodeMetas)) byId.set(m.id, uid);
  const start = byId.get(startId);
  if (start === undefined) throw new Error(`module ${startId} not in stats`);
  const prev = new Map<string, string | null>([[start, null]]);
  const queue = [start];
  for (let i = 0; i < queue.length; i++) {
    const uid = queue[i];
    const meta = stats.nodeMetas[uid];
    if (target.test(meta.id)) {
      const chain: string[] = [];
      for (let cur: string | null = uid; cur !== null; cur = prev.get(cur) ?? null) {
        chain.unshift(stats.nodeMetas[cur].id);
      }
      return chain;
    }
    for (const e of meta.imported) {
      if (e.dynamic || prev.has(e.uid)) continue;
      prev.set(e.uid, uid);
      queue.push(e.uid);
    }
  }
  return null;
}

const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`;

function main(argv: string[]): void {
  const statsPath = argv[0] ?? "dist-bundle/stats.json";
  // Default: tiptap itself (no direct chain exists) and @floating-ui/dom, which
  // manualChunks places in the tiptap chunk even though reka-ui needs it too.
  const targets = (argv.length > 1 ? argv.slice(1) : ["node_modules/(@tiptap|prosemirror-)", "node_modules/@floating-ui/dom/"]).map(
    (t) => new RegExp(t),
  );
  const stats = JSON.parse(readFileSync(statsPath, "utf8")) as Stats;
  const entry = Object.values(stats.nodeMetas)
    .flatMap((m) => Object.keys(m.moduleParts))
    .find((c) => /^assets\/index-[^/]+\.js$/.test(c));
  if (entry === undefined) throw new Error("no assets/index-*.js chunk in stats");
  const mods = modulesInChunk(stats, entry);
  const total = mods.reduce((s, m) => s + m.rendered, 0);
  console.log(`Entry chunk ${entry}: ${mods.length} modules, ${kb(total)} rendered`);

  const glyphs = mods.filter((m) => /(nav|dice|crafting)Glyphs(\.assets)?\.generated\./.test(m.id));
  for (const g of glyphs) console.log(`  glyph  ${kb(g.rendered).padStart(10)}  ${g.id}`);
  const gSum = glyphs.reduce((s, m) => s + m.rendered, 0);
  const gGz = glyphs.reduce((s, m) => s + m.gzip, 0);
  console.log(`  glyph files total: ${kb(gSum)} rendered (${((100 * gSum) / total).toFixed(1)}%), ${kb(gGz)} gzip`);

  console.log("\n10 largest source modules in the entry chunk");
  for (const m of mods.filter((x) => !x.id.includes("node_modules")).slice(0, 10)) {
    console.log(`  ${kb(m.rendered).padStart(10)}  ${kb(m.gzip).padStart(9)} gz  ${m.id}`);
  }

  // The visualizer records module ids relative to the project root.
  const entryModule = path.posix.join("/", "src/main.ts");
  for (const target of targets) {
    const chain = staticChain(stats, entryModule, target);
    console.log(`\nStatic import chain from ${entryModule} to ${target.source}`);
    console.log(chain ? chain.map((c, i) => `${" ".repeat(i * 2)}${i ? "-> " : ""}${c}`).join("\n") : "  none");
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  main(process.argv.slice(2));
}
