/**
 * The compact record of a wiki-export import that lives on the
 * `document_imports` row (#932): which pages the DM kept and what kind each
 * was settled as. Page bodies are NOT here: they stay in the browser's memory
 * for the length of the review, which keeps the insert small however large
 * the export is and means nothing the DM wrote is stored twice.
 *
 * What the manifest is for is an interrupted review. A reload loses the
 * bodies; the DM drops the same export again, and the kinds they already
 * settled are restored by page `ref` rather than asked for a second time.
 */
import type { ArchivePage, ArchivePageKind, ArchiveSource } from "./types";

export const ARCHIVE_MANIFEST_VERSION = 1;

export interface ArchiveManifestPage {
  ref: string;
  title: string;
  kind: ArchivePageKind;
}

export interface ArchiveManifest {
  archive: {
    version: typeof ARCHIVE_MANIFEST_VERSION;
    source: ArchiveSource;
    pages: ArchiveManifestPage[];
  };
}

const KINDS: readonly ArchivePageKind[] = ["npc", "location", "faction", "quest", "item", "note", "skip"];
const SOURCES: readonly ArchiveSource[] = ["grimoire", "obsidian", "legendkeeper", "worldanvil", "unknown"];

/** `kinds` holds the DM's settled kind per page `ref`; a page without an entry keeps its guessed kind. */
export function buildArchiveManifest(
  source: ArchiveSource,
  pages: readonly ArchivePage[],
  kinds: ReadonlyMap<string, ArchivePageKind>,
): ArchiveManifest {
  return {
    archive: {
      version: ARCHIVE_MANIFEST_VERSION,
      source,
      pages: pages.map((page) => ({ ref: page.ref, title: page.title, kind: kinds.get(page.ref) ?? page.kind })),
    },
  };
}

/**
 * The manifest out of an untrusted jsonb value, or null when it is not one.
 * Entries that are not well formed are dropped rather than repaired: the page
 * then simply keeps the kind the reader guesses.
 */
export function parseArchiveManifest(value: unknown): ArchiveManifest | null {
  if (typeof value !== "object" || value === null) return null;
  const archive = (value as { archive?: unknown }).archive;
  if (typeof archive !== "object" || archive === null) return null;
  const { version, source, pages } = archive as { version?: unknown; source?: unknown; pages?: unknown };
  if (version !== ARCHIVE_MANIFEST_VERSION || !Array.isArray(pages)) return null;
  if (typeof source !== "string" || !(SOURCES as readonly string[]).includes(source)) return null;
  const kept: ArchiveManifestPage[] = [];
  for (const raw of pages) {
    if (typeof raw !== "object" || raw === null) continue;
    const { ref, title, kind } = raw as { ref?: unknown; title?: unknown; kind?: unknown };
    if (typeof ref !== "string" || typeof title !== "string") continue;
    if (typeof kind !== "string" || !(KINDS as readonly string[]).includes(kind)) continue;
    kept.push({ ref, title, kind: kind as ArchivePageKind });
  }
  return { archive: { version: ARCHIVE_MANIFEST_VERSION, source: source as ArchiveSource, pages: kept } };
}

/** `ref` → settled kind, for restoring a re-read export's kinds. */
export function kindsFromManifest(manifest: ArchiveManifest): Map<string, ArchivePageKind> {
  return new Map(manifest.archive.pages.map((page) => [page.ref, page.kind]));
}

/** Pages that will become records: every page not set to skip. */
export function importablePageCount(manifest: ArchiveManifest): number {
  return manifest.archive.pages.filter((page) => page.kind !== "skip").length;
}
