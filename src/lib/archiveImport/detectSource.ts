/**
 * Which app wrote the archive. Detected from structure, evidence recorded,
 * never required: every importer path works on generic semantics and the
 * answer only labels the review screen. The checks are ordered strongest
 * first, and a miss is `"unknown"`.
 */
import type { ArchiveSource } from "./types";

export interface SourceSample {
  path: string;
  /** The first few KB of the file as text. */
  head: string;
}

export interface SourceDetection {
  source: ArchiveSource;
  evidence: string[];
}

/** Marker text of our own vault README (`markdownVault.ts` `buildReadme`). */
export const GRIMOIRE_README_MARKER = "Grimoire cannot restore it";

export function detectSource(paths: readonly string[], samples: readonly SourceSample[]): SourceDetection {
  const lower = paths.map((p) => p.toLowerCase());
  const has = (test: (p: string) => boolean) => lower.some(test);
  const sampleHas = (test: (s: SourceSample) => boolean) => samples.find(test);

  const ownIdSample = sampleHas((s) => /^---[\s\S]*?\bgrimoire_id:/.test(s.head));
  const ownReadme = sampleHas((s) => /(^|\/)readme\.md$/i.test(s.path) && s.head.includes(GRIMOIRE_README_MARKER));
  if (ownIdSample || ownReadme) {
    return {
      source: "grimoire",
      evidence: [ownReadme ? "README.md describes a Grimoire vault export" : `frontmatter grimoire_id in ${ownIdSample?.path}`],
    };
  }

  const waJson = sampleHas((s) => /\.json$/i.test(s.path) && /"(entityClass|templateType)"\s*:/.test(s.head));
  const waHtml = sampleHas((s) => /\.html?$/i.test(s.path) && /world\s*-?\s*anvil|worldanvil/i.test(s.head));
  if (waJson || waHtml) {
    return {
      source: "worldanvil",
      evidence: [waJson ? `article JSON with an entity class: ${waJson.path}` : `World Anvil markup in ${waHtml?.path}`],
    };
  }

  const lkMarkup = sampleHas((s) => /\.html?$/i.test(s.path) && /legend\s*-?\s*keeper|legendkeeper/i.test(s.head));
  const lkLayout =
    has((p) => p === "index.html") && has((p) => p.startsWith("css/") || p.startsWith("js/")) && has((p) => p.endsWith(".html") && p !== "index.html");
  if (lkMarkup || lkLayout) {
    return {
      source: "legendkeeper",
      evidence: [lkMarkup ? `LegendKeeper markup in ${lkMarkup.path}` : "index.html with css/ and js/ folders beside HTML documents"],
    };
  }

  const obsidianDir = has((p) => p.startsWith(".obsidian/") || p.includes("/.obsidian/"));
  const wikilinks = sampleHas((s) => /\.md$/i.test(s.path) && /\[\[[^\]\n]+\]\]/.test(s.head));
  if (obsidianDir || wikilinks) {
    return {
      source: "obsidian",
      evidence: [obsidianDir ? ".obsidian/ settings folder present" : `[[wikilinks]] in ${wikilinks?.path}`],
    };
  }

  return { source: "unknown", evidence: [] };
}
