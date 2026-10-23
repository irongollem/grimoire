/**
 * The Open Book's reading order (#1085): the model's chapters and entries laid end to end as *sections*, each with
 * its own address, the way a printed book has leaves. A visitor turns from the last spread of one section into the
 * first of the next, and the URL follows.
 *
 *   contents, then per chapter (the Chronicle opens on its almanac, the rest on their first entry), then the index.
 *
 * Pure: it knows routes by name and the model by value, nothing about the DOM or the router instance.
 */

import type { RouteLocationRaw } from "vue-router";
import type { OpenBookChapter } from "@/types/openBook.types";
import { OPEN_BOOK_CHAPTERS } from "@/types/openBook.types";
import type { BookEntryRef, BookModel } from "./bookModel";
import { estimatePages } from "./pagination";

export type SectionKind = "contents" | "almanac" | "entry" | "index";

export interface BookSection {
  /** Stable across turns and releases of the same page: `contents`, `almanac`, `index` or `entry:<id>`. */
  key: string;
  kind: SectionKind;
  chapter: OpenBookChapter | null;
  entry: BookEntryRef | null;
  title: string;
}

export const CONTENTS_KEY = "contents";
export const ALMANAC_KEY = "almanac";
export const INDEX_KEY = "index";

export function entryKey(id: string): string {
  return `entry:${id}`;
}

export function sectionsOf(model: BookModel): BookSection[] {
  const sections: BookSection[] = [{ key: CONTENTS_KEY, kind: "contents", chapter: null, entry: null, title: "Contents" }];
  for (const chapter of model.chapters) {
    if (chapter.chapter === "chronicle") {
      sections.push({ key: ALMANAC_KEY, kind: "almanac", chapter: "chronicle", entry: null, title: "The Almanac" });
    }
    for (const entry of chapter.entries) {
      sections.push({ key: entryKey(entry.id), kind: "entry", chapter: chapter.chapter, entry, title: entry.title });
    }
  }
  sections.push({ key: INDEX_KEY, kind: "index", chapter: null, entry: null, title: "Index of names" });
  return sections;
}

/** The route for a section, optionally at a unit (`?s=`). The first unit has no query so an address stays clean. */
export function sectionLocation(slug: string, section: BookSection, query?: Record<string, string>): RouteLocationRaw {
  const base = { query: query && Object.keys(query).length > 0 ? query : undefined };
  switch (section.kind) {
    case "contents":
      return { name: "open-book-contents", params: { slug }, ...base };
    case "index":
      return { name: "open-book-index", params: { slug }, ...base };
    case "almanac":
      return { name: "open-book-chapter", params: { slug, chapter: "chronicle" }, ...base };
    case "entry": {
      const entry = section.entry;
      if (!entry) return { name: "open-book", params: { slug } };
      return { name: "open-book-entry", params: { slug, chapter: entry.chapter, entryId: entry.id }, ...base };
    }
  }
}

function isChapter(value: string): value is OpenBookChapter {
  return (OPEN_BOOK_CHAPTERS as readonly string[]).includes(value);
}

/**
 * Which section a route names, or `null` for a page that is not in this book (an unknown chapter, an entry the DM
 * left out, an entry filed under another chapter).
 */
export function resolveSection(
  sections: readonly BookSection[],
  routeName: string | symbol | null | undefined,
  params: { chapter?: string; entryId?: string },
): BookSection | null {
  const find = (key: string) => sections.find((s) => s.key === key) ?? null;
  switch (routeName) {
    case "open-book-contents":
      return find(CONTENTS_KEY);
    case "open-book-index":
      return find(INDEX_KEY);
    case "open-book-chapter": {
      const chapter = params.chapter ?? "";
      if (!isChapter(chapter)) return null;
      if (chapter === "chronicle") return find(ALMANAC_KEY);
      return sections.find((s) => s.kind === "entry" && s.chapter === chapter) ?? null;
    }
    case "open-book-entry": {
      const hit = find(entryKey(params.entryId ?? ""));
      return hit && hit.chapter === params.chapter ? hit : null;
    }
    default:
      return null;
  }
}

/** The chapter whose tab is pulled out while reading `section`. The index has its own tab. */
export function tabOf(section: BookSection): OpenBookChapter | "index" | null {
  if (section.kind === "index") return "index";
  return section.chapter;
}

export function neighbours(sections: readonly BookSection[], key: string): { prev: BookSection | null; next: BookSection | null } {
  const i = sections.findIndex((s) => s.key === key);
  if (i < 0) return { prev: null, next: null };
  return { prev: sections[i - 1] ?? null, next: sections[i + 1] ?? null };
}

/** The first section of a chapter: where its thumb tab opens the book. */
export function chapterOpener(sections: readonly BookSection[], chapter: OpenBookChapter): BookSection | null {
  return sections.find((s) => s.chapter === chapter) ?? null;
}

/** Characters of stored text an entry will print, as a stand-in for its length before it has been laid out. */
function storedLength(value: string | null | undefined): number {
  // Stored rich text is Tiptap JSON: roughly half of it is markup, not words.
  return value ? Math.ceil(value.length * 0.55) : 0;
}

/** A rough page count for every section, used for folio numbers until a section has been measured. */
export function estimateSectionPages(model: BookModel, sections: readonly BookSection[]): Map<string, number> {
  const snap = model.snapshot;
  const chars = new Map<string, number>();
  for (const p of snap.places) chars.set(p.id, 400 + storedLength(p.description) + storedLength(p.player_summary));
  for (const p of snap.folk) chars.set(p.id, 500);
  for (const f of snap.factions) chars.set(f.id, 400 + storedLength(f.description));
  for (const p of snap.pantheons) chars.set(p.id, 400 + storedLength(p.description) + model.deitiesOf(p.id).length * 120);
  for (const d of snap.deities) chars.set(d.id, 500 + storedLength(d.description));
  for (const l of snap.lore) chars.set(l.id, 300 + storedLength(l.content));
  for (const s of snap.sessions) chars.set(s.id, 300 + storedLength(s.content));

  const out = new Map<string, number>();
  for (const section of sections) {
    let count: number;
    switch (section.kind) {
      case "contents":
        count = 2;
        break;
      case "almanac":
        count = estimatePages(1500 + snap.events.length * 260);
        break;
      case "index":
        count = estimatePages(model.entries.length * 70);
        break;
      case "entry":
        count = estimatePages(section.entry ? (chars.get(section.entry.id) ?? 0) : 0);
        break;
    }
    out.set(section.key, count);
  }
  return out;
}

export interface Crumb {
  label: string;
  /** `null` for the page the visitor is on. */
  to: RouteLocationRaw | null;
}

/** Where you are, for the desk bar: the chapter, a place's ancestors that are in the book, then the page itself. */
export function crumbsOf(model: BookModel, sections: readonly BookSection[], slug: string, section: BookSection): Crumb[] {
  if (section.kind === "contents") return [{ label: "Contents", to: null }];
  if (section.kind === "index") return [{ label: "Index of names", to: null }];
  const trail: Crumb[] = [];
  const chapter = section.chapter ? model.chapters.find((c) => c.chapter === section.chapter) : undefined;
  const opener = section.chapter ? chapterOpener(sections, section.chapter) : null;
  if (chapter) trail.push({ label: chapter.title, to: opener && opener.key !== section.key ? sectionLocation(slug, opener) : null });
  if (section.kind === "almanac") return [{ label: chapter?.title ?? section.title, to: null }];
  const entry = section.entry;
  if (!entry) return trail;
  if (entry.kind === "place") {
    for (const ancestor of model.ancestorsOf(entry.id)) {
      const target = sections.find((s) => s.key === entryKey(ancestor.id));
      trail.push({ label: ancestor.name, to: target ? sectionLocation(slug, target) : null });
    }
  }
  trail.push({ label: entry.title, to: null });
  return trail;
}
