/**
 * The pure parts of `scripts/scriptorium-book.ts` (epic #1115): joining a book's
 * chapters into one markdown source, deciding where a `::: art` slot's picture
 * comes from, and counting words the way the editor does. Nothing here touches
 * the network, the disk or an image library; every lookup is injected.
 */
import { homedir } from "node:os";
import { join } from "node:path";
import type { JSONContent } from "@tiptap/core";
import type { ArtSlot } from "../../src/lib/scriptorium/markdownImport.ts";
import { normalizeName } from "./name-matching.ts";

/** Chapters are separated by a Homebrewery page directive the converter turns into a page break. */
export const CHAPTER_SEPARATOR = "\n\n\\page\n\n";

/** The chapters in the order given, trimmed, empty ones dropped, one page break between each. */
export function joinChapters(chapters: readonly string[]): string {
  return chapters
    .map((c) => c.trim())
    .filter((c) => c.length > 0)
    .join(CHAPTER_SEPARATOR);
}

/** Chapter files in filename order (`00-front-matter.md` ... `11-appendices.md`). */
export function chapterFileNames(names: readonly string[]): string[] {
  return names.filter((n) => n.toLowerCase().endsWith(".md")).sort((a, b) => a.localeCompare(b, "en"));
}

export function expandHome(path: string): string {
  return path.startsWith("~") ? join(homedir(), path.slice(1)) : path;
}

/** Where an `existing:` / `alt:` value points. */
export type ArtReference =
  | { kind: "campaign-npc"; name: string }
  | { kind: "file"; root: "desktop" | "source"; relativePath: string };

const NPC_PREFIX = /^campaign-npc\s*:\s*(.+)$/i;
const DESKTOP_PREFIX = "art-955/kind-country/out/";

/**
 * Reads one reference. Forms: `campaign-npc: <Exact Name>`; `art-955/kind-country/out/<file>`
 * (a file on the Desktop); anything else (`Sothery_Map.png`, `illustrations/...`) is a
 * file under the book's source folder. Null for an empty value.
 */
export function parseArtReference(value: string | undefined): ArtReference | null {
  const text = value?.trim();
  if (!text) return null;
  const npc = NPC_PREFIX.exec(text);
  if (npc) return { kind: "campaign-npc", name: npc[1].trim() };
  if (text.startsWith(DESKTOP_PREFIX)) return { kind: "file", root: "desktop", relativePath: text };
  return { kind: "file", root: "source", relativePath: text };
}

/** The slot's references in resolution order: `existing`, then `alt`. */
export function slotReferences(slot: ArtSlot): ArtReference[] {
  return [slot.existing, slot.alt].flatMap((v) => {
    const ref = parseArtReference(v);
    return ref ? [ref] : [];
  });
}

export interface ArtLookups {
  /** Portrait URL by normalised NPC name; absent when the NPC is unknown, has no portrait or the name is ambiguous. */
  npcPortraits: ReadonlyMap<string, string>;
  fileExists: (absolutePath: string) => boolean;
  desktopDir: string;
  sourceDir: string;
}

export type ResolvedArt = { kind: "url"; url: string; via: string } | { kind: "file"; path: string; via: string };

/** The first reference that resolves, in order; null leaves the slot a placeholder. */
export function resolveArtSlot(slot: ArtSlot, lookups: ArtLookups): ResolvedArt | null {
  for (const ref of slotReferences(slot)) {
    if (ref.kind === "campaign-npc") {
      const url = lookups.npcPortraits.get(normalizeName(ref.name));
      if (url) return { kind: "url", url, via: `campaign-npc: ${ref.name}` };
      continue;
    }
    const path = join(ref.root === "desktop" ? lookups.desktopDir : lookups.sourceDir, ref.relativePath);
    if (lookups.fileExists(path)) return { kind: "file", path, via: ref.relativePath };
  }
  return null;
}

/** The editor's own count: whitespace-separated words of the text, blocks separated by a space. */
export function countWords(content: JSONContent): number {
  const parts: string[] = [];
  const walk = (node: JSONContent): void => {
    if (typeof node.text === "string") parts.push(node.text);
    for (const child of node.content ?? []) walk(child);
    if (node.content && node.type !== "text") parts.push(" ");
  };
  walk(content);
  const text = parts.join("").trim();
  return text ? text.split(/\s+/).length : 0;
}

/** Storage path of an asset image: the owner's folder, keyed by content hash so a re-run reuses it. */
export function assetImagePath(userId: string, contentHash: string): string {
  return `${userId}/${contentHash}.webp`;
}

/** Every node of `type`, depth first. */
export function countNodes(content: JSONContent, type: string): number {
  let n = content.type === type ? 1 : 0;
  for (const child of content.content ?? []) n += countNodes(child, type);
  return n;
}
