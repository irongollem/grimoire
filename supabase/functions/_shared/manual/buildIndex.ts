// The in-app manual (`src/manual/*.md`) as a list Ask can search from an edge function (#1253 follow-up).
//
// Why a generated copy: an edge function cannot import Markdown (Deno has no loader for it) and the deploy bundles
// only the TypeScript that is imported. So `npm run manual:index` writes the pages into `manualPages.generated.ts`,
// and `manualPages.test.ts` fails when that file no longer matches the Markdown.
//
// Pure: the files come in as text, so the script and the test build the same thing from the same code.

export interface ManualPageSource {
  /** The filename without `.md`, the id the in-app manual uses. */
  id: string;
  title: string;
  section: string;
  summary: string;
  keywords: string[];
  /** The Markdown after the frontmatter. */
  body: string;
}

export interface ManualFile {
  /** `foo.md`. */
  name: string;
  raw: string;
}

/** YAML lets a value be quoted (a title with a colon must be); the quotes are syntax, not part of the value. */
function unquote(val: string): string {
  if (val.length >= 2 && val.startsWith('"') && val.endsWith('"')) return val.slice(1, -1).replace(/\\"/g, '"');
  if (val.length >= 2 && val.startsWith("'") && val.endsWith("'")) return val.slice(1, -1).replace(/''/g, "'");
  return val;
}

export function parseManualFile(file: ManualFile): ManualPageSource {
  const match = file.raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (!match) throw new Error(`${file.name}: a manual page must start with a frontmatter block`);
  const meta: Record<string, string> = {};
  for (const line of match[1].split("\n")) {
    const colon = line.indexOf(":");
    if (colon === -1) continue;
    meta[line.slice(0, colon).trim()] = unquote(line.slice(colon + 1).trim());
  }
  if (!meta.title) throw new Error(`${file.name}: frontmatter has no title`);
  return {
    id: file.name.replace(/\.md$/, ""),
    title: meta.title,
    section: meta.section ?? "",
    summary: meta.summary ?? "",
    keywords: (meta.keywords ?? "").split(",").map((k) => k.trim()).filter((k) => k !== ""),
    body: match[2].trim(),
  };
}

/** Every page, in id order so the generated file does not change when the directory listing does. */
export function buildManualIndex(files: readonly ManualFile[]): ManualPageSource[] {
  return files
    .filter((f) => f.name.endsWith(".md"))
    .map(parseManualFile)
    .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

export const GENERATED_HEADER = `// GENERATED FILE. Do not edit by hand.
// Written by \`npm run manual:index\` (scripts/manual/buildManualIndex.ts) from src/manual/*.md, so Ask Grimoire's
// \`read_manual\` tool can answer from the in-app manual inside an edge function, which cannot import Markdown.
// \`manualPages.test.ts\` fails when this file is out of date: run the command again after editing a manual page.

import type { ManualPageSource } from "./buildIndex.ts";

`;

export function renderManualModule(pages: readonly ManualPageSource[]): string {
  return `${GENERATED_HEADER}export const MANUAL_PAGES: readonly ManualPageSource[] = ${JSON.stringify(pages, null, 2)};\n`;
}
