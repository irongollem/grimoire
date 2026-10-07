/**
 * Reads a wiki export into pages (#932, story 6). Browser-side, synchronous,
 * no AI: unzips (fflate), skips what is not a page (with a reason, never
 * silently), detects the source app, and turns each remaining file into one
 * `ArchivePage` whose body is kept whole as rich text.
 *
 * Vendor facts this leans on, none of them required: Obsidian is Markdown with
 * optional YAML frontmatter; LegendKeeper exports a directory of HTML documents
 * plus index.html and css/js; World Anvil exports JSON articles (content in
 * BBCode, which is not parsed) beside human-readable HTML. We have no sample
 * exports, so everything works on generic semantics and degrades to a plain
 * note; see `kindHints.ts` for the extensible hint tables.
 *
 * Nesting: a page's parent is, in order, its `parent:` frontmatter (our own
 * export writes it) or the *folder note* of its folder: `Folder/Folder.ext`,
 * a sibling `Folder.ext` beside the folder, or `Folder/index.ext`. A folder
 * without such a page makes no parent: folders are not records.
 */
import { strFromU8, unzipSync } from "fflate";
import { detectSource, GRIMOIRE_README_MARKER, type SourceSample } from "./detectSource";
import { hintKey, kindForWord } from "./kindHints";
import { findPageForLink } from "./links";
import { readHtmlPage } from "./htmlPage";
import { parentTargetOf, readMarkdownPage, type PageDraft } from "./markdownPage";
import type { ArchiveInputFile, ArchivePage, ArchiveReadResult, ArchiveSkip } from "./types";

/** Matches the CHECK on an archive row (`page_count <= 2000`). */
export const MAX_ARCHIVE_PAGES = 2000;
/** Total uncompressed size read, against zip bombs. */
export const MAX_ARCHIVE_BYTES = 100 * 1024 * 1024;

export type ArchiveReadErrorCode = "too_many_pages" | "too_large" | "unreadable_zip";

/** A refusal the import tab shows as-is: the message is written for the DM. */
export class ArchiveReadError extends Error {
  constructor(
    readonly code: ArchiveReadErrorCode,
    message: string,
  ) {
    super(message);
    this.name = "ArchiveReadError";
  }
}

const IMAGE_EXT = /\.(png|jpe?g|gif|webp|svg|bmp|avif|tiff?|ico|heic)$/i;
const MEDIA_EXT = /\.(mp3|wav|ogg|m4a|flac|mp4|webm|mov|m4v|pdf|ttf|otf|woff2?)$/i;

function skipReasonForPath(path: string): string | null {
  const segments = path.split("/");
  if (segments.includes("__MACOSX")) return "macOS archive metadata";
  const hidden = segments.find((s) => s.startsWith("."));
  if (hidden) return hidden === ".obsidian" ? "Obsidian settings" : "hidden file";
  if (IMAGE_EXT.test(path)) return "image attachment";
  if (MEDIA_EXT.test(path)) return "attachment";
  if (/\.(css|js|mjs|map)$/i.test(path)) return "stylesheet or script";
  if (/\.zip$/i.test(path)) return "nested archives are not read";
  if (/\.(canvas|base)$/i.test(path)) return "Obsidian canvas, not a page";
  if (!/\.(md|markdown|html?|json)$/i.test(path)) return "unsupported file type";
  return null;
}

function cleanPath(name: string): string {
  return name.replace(/\\/g, "/").replace(/^(\.\/)+/, "").replace(/^\/+/, "");
}

interface Entry {
  path: string;
  bytes: Uint8Array;
}

/** Expands zips, drops unreadable-by-design files with a reason, and enforces the size cap on what is kept. */
function expand(files: readonly ArchiveInputFile[], skipped: ArchiveSkip[], allPaths: string[]): Entry[] {
  const kept: Entry[] = [];
  let total = 0;
  const take = (path: string, size: number): boolean => {
    allPaths.push(path);
    const reason = skipReasonForPath(path);
    if (reason) {
      skipped.push({ path, reason });
      return false;
    }
    total += size;
    if (total > MAX_ARCHIVE_BYTES) {
      throw new ArchiveReadError("too_large", `This archive is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB once unpacked. Split it into smaller exports.`);
    }
    return true;
  };

  for (const file of files) {
    const name = cleanPath(file.name);
    if (/\.zip$/i.test(name)) {
      let unpacked: Record<string, Uint8Array>;
      const declared = new Map<string, number>();
      try {
        // The filter runs before inflation, so skipped attachments and an oversized archive cost nothing.
        unpacked = unzipSync(file.bytes, {
          filter: (entry) => {
            const path = cleanPath(entry.name);
            if (!path || path.endsWith("/")) return false;
            const keep = take(path, entry.originalSize);
            if (keep) declared.set(entry.name, entry.originalSize);
            return keep;
          },
        });
      } catch (error) {
        if (error instanceof ArchiveReadError) throw error;
        throw new ArchiveReadError("unreadable_zip", `"${file.name}" could not be read as a zip archive.`);
      }
      // The filter trusted each entry's *declared* size, which a crafted zip can
      // understate; count what actually came out too.
      for (const [entryName, bytes] of Object.entries(unpacked)) {
        const claimed = declared.get(entryName);
        if (claimed !== undefined) total += bytes.byteLength - claimed;
        if (total > MAX_ARCHIVE_BYTES) {
          throw new ArchiveReadError("too_large", `This archive is larger than ${MAX_ARCHIVE_BYTES / 1024 / 1024} MB once unpacked. Split it into smaller exports.`);
        }
        kept.push({ path: cleanPath(entryName), bytes });
      }
    } else if (take(name, file.bytes.byteLength)) {
      kept.push({ path: name, bytes: file.bytes });
    }
  }
  return kept;
}

/** An export zipped from a folder has one root folder that is the vault's name, not a place. Kind folders (NPCs/) are not roots. */
function sharedRoot(entries: readonly Entry[]): string | null {
  if (!entries.length || entries.some((e) => !e.path.includes("/"))) return null;
  const root = entries[0].path.split("/")[0];
  if (entries.some((e) => e.path.split("/")[0] !== root)) return null;
  return kindForWord(root) === null ? root : null;
}

// ── World Anvil article JSON, used only as a classification hint ────────

const ARTICLE_CLASS_KEYS = ["entityClass", "templateType", "template", "entity_class", "type", "class"] as const;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

interface ArticleHint {
  title: string;
  slug: string | null;
  template: string;
}

function articleHint(value: unknown): ArticleHint | null {
  if (!isRecord(value)) return null;
  const title = typeof value.title === "string" ? value.title : typeof value.name === "string" ? value.name : null;
  if (!title) return null;
  const key = ARTICLE_CLASS_KEYS.find((k) => typeof value[k] === "string" && (value[k] as string).trim() !== "");
  if (!key) return null;
  return { title, slug: typeof value.slug === "string" ? value.slug : null, template: value[key] as string };
}

function collectArticleHints(value: unknown, depth: number, into: ArticleHint[]): void {
  if (Array.isArray(value)) {
    for (const item of value) collectArticleHints(item, depth, into);
    return;
  }
  const hint = articleHint(value);
  if (hint) {
    into.push(hint);
    return;
  }
  if (depth <= 0 || !isRecord(value)) return;
  for (const key of ["articles", "entities", "data", "items", "results"]) {
    if (key in value) collectArticleHints(value[key], depth - 1, into);
  }
}

function buildTemplateHints(jsonEntries: Entry[], skipped: ArchiveSkip[]): (candidates: string[]) => string | null {
  const byKey = new Map<string, string>();
  for (const entry of jsonEntries) {
    let hints: ArticleHint[] = [];
    try {
      collectArticleHints(JSON.parse(strFromU8(entry.bytes)), 3, hints);
    } catch {
      hints = [];
    }
    if (!hints.length) {
      skipped.push({ path: entry.path, reason: "JSON data, not a page" });
      continue;
    }
    skipped.push({ path: entry.path, reason: "World Anvil article data (used to classify its page, BBCode body not read)" });
    for (const h of hints) {
      for (const name of [h.title, h.slug]) {
        const key = name ? hintKey(name) : null;
        if (key && !byKey.has(key)) byKey.set(key, h.template);
      }
    }
  }
  return (candidates) => {
    for (const c of candidates) {
      const key = hintKey(c);
      const hit = key ? byKey.get(key) : undefined;
      if (hit) return hit;
    }
    return null;
  };
}

// ── parents ─────────────────────────────────────────────────────────────

function noExt(path: string): string {
  return path.replace(/\.(md|markdown|html?)$/i, "").toLowerCase();
}

function resolveParents(drafts: PageDraft[]): ArchivePage[] {
  const byPath = new Map<string, PageDraft>();
  for (const d of drafts) if (!byPath.has(noExt(d.path))) byPath.set(noExt(d.path), d);
  const asPages = drafts.map((d) => ({ ...d, parentRef: null as string | null }));
  const pageFor = new Map(asPages.map((p) => [p.ref, p]));

  for (const page of asPages) {
    const draft = drafts.find((d) => d.ref === page.ref);
    let parent: ArchivePage | null = null;
    if (draft?.parentHint) {
      const hit = findPageForLink(parentTargetOf(draft.parentHint), asPages);
      if (hit && hit.ref !== page.ref) parent = hit;
    }
    if (!parent && page.folders.length) {
      const folder = page.folders[page.folders.length - 1];
      const inside = page.folders.join("/");
      const above = page.folders.slice(0, -1).join("/");
      const candidates = [`${inside}/${folder}`, above ? `${above}/${folder}` : folder, `${inside}/index`].map((c) => c.toLowerCase());
      for (const c of candidates) {
        const hit = byPath.get(c);
        if (hit && hit.ref !== page.ref) {
          parent = pageFor.get(hit.ref) ?? null;
          break;
        }
      }
    }
    page.parentRef = parent ? parent.ref : null;
  }

  // Break cycles (A's parent is B and B's is A): the page that closes the loop becomes a root.
  for (const page of asPages) {
    const seen = new Set<string>([page.ref]);
    let cursor = page.parentRef ? pageFor.get(page.parentRef) : undefined;
    while (cursor) {
      if (seen.has(cursor.ref)) {
        page.parentRef = null;
        break;
      }
      seen.add(cursor.ref);
      cursor = cursor.parentRef ? pageFor.get(cursor.parentRef) : undefined;
    }
  }
  return asPages.map(({ parentHint: _parentHint, ...page }) => page);
}

// ── entry point ─────────────────────────────────────────────────────────

/**
 * @throws ArchiveReadError when the archive is unreadable, too large, or holds
 * more than `MAX_ARCHIVE_PAGES` pages.
 */
export function readArchive(files: readonly ArchiveInputFile[]): ArchiveReadResult {
  const skipped: ArchiveSkip[] = [];
  const allPaths: string[] = [];
  let entries = expand(files, skipped, allPaths);
  const root = sharedRoot(entries);
  if (root) {
    // Every path the reader reports, kept or skipped, is relative to the vault root.
    const strip = (path: string) => (path.startsWith(`${root}/`) ? path.slice(root.length + 1) : path);
    entries = entries.map((e) => ({ ...e, path: strip(e.path) }));
    for (const s of skipped) s.path = strip(s.path);
    for (let i = 0; i < allPaths.length; i++) allPaths[i] = strip(allPaths[i]);
  }
  entries.sort((a, b) => a.path.localeCompare(b.path));

  const texts = new Map<string, string>();
  const textOf = (e: Entry): string => {
    const cached = texts.get(e.path);
    if (cached !== undefined) return cached;
    const text = strFromU8(e.bytes);
    texts.set(e.path, text);
    return text;
  };

  const samples: SourceSample[] = entries.map((e) => ({ path: e.path, head: textOf(e).slice(0, 8192) }));
  const detection = detectSource(allPaths, samples);

  const templateHint = buildTemplateHints(entries.filter((e) => /\.json$/i.test(e.path)), skipped);

  const drafts: PageDraft[] = [];
  for (const entry of entries) {
    if (/\.json$/i.test(entry.path)) continue;
    const text = textOf(entry);
    if (/^readme\.md$/i.test(entry.path) && text.includes(GRIMOIRE_README_MARKER)) {
      skipped.push({ path: entry.path, reason: "Grimoire export index" });
      continue;
    }
    const parsed = /\.html?$/i.test(entry.path) ? readHtmlPage(entry.path, text, templateHint) : readMarkdownPage(entry.path, text, templateHint);
    if ("skip" in parsed) skipped.push({ path: entry.path, reason: parsed.skip });
    else drafts.push(parsed.page);
  }

  if (drafts.length > MAX_ARCHIVE_PAGES) {
    throw new ArchiveReadError(
      "too_many_pages",
      `This archive has ${drafts.length} pages; the importer takes at most ${MAX_ARCHIVE_PAGES} at a time. Split the export into smaller parts.`,
    );
  }

  return {
    source: detection.source,
    sourceEvidence: detection.evidence,
    pages: resolveParents(drafts),
    skipped,
  };
}
