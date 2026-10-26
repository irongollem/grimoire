/**
 * The Open Book as a reader sees it (#1085): a released snapshot turned into chapters, entries, and the
 * lookups a book needs (place tree, who lives where, which pages cite this one, an A-Z index).
 *
 * Pure data in, pure data out. `buildBookModel` builds every map once; the functions on the model are lookups.
 * Ids the snapshot cites but does not contain (a place's parent, a person's location, a deity's pantheon) are
 * expected: the DM may have left that page out, so a missing target is treated as absent, never as an error.
 */

import { OPEN_BOOK_CHAPTERS, type OpenBookChapter, type OpenBookDeity, type OpenBookPerson, type OpenBookPlace, type OpenBookSession, type OpenBookSnapshot } from "@/types/openBook.types";
import { parseStoredContent } from "@/lib/tiptap/viewerRender";
import { connectionsFromTies, readTies, type BookConnectionGroup } from "@/lib/openBook/connections";

export interface ChapterMeta {
  numeral: string;
  title: string;
  tab: string;
}

export const CHAPTER_META: Record<OpenBookChapter, ChapterMeta> = {
  atlas: { numeral: "I", title: "The Atlas", tab: "Atlas" },
  folk: { numeral: "II", title: "Folk", tab: "Folk" },
  factions: { numeral: "III", title: "Factions and Houses", tab: "Factions" },
  pantheon: { numeral: "IV", title: "The Pantheon", tab: "Pantheon" },
  lore: { numeral: "V", title: "Lore and Legend", tab: "Lore" },
  chronicle: { numeral: "VI", title: "The Chronicle", tab: "Chronicle" },
};

export type BookEntryKind = "place" | "person" | "faction" | "pantheon" | "deity" | "lore" | "session";

export interface BookEntryRef {
  kind: BookEntryKind;
  chapter: OpenBookChapter;
  id: string;
  title: string;
  subtitle: string | null;
  /** Relative to the book root: `${chapter}/${id}`. */
  path: string;
}

export interface BookChapterModel {
  chapter: OpenBookChapter;
  numeral: string;
  title: string;
  tab: string;
  entries: BookEntryRef[];
}

export interface BookIndexGroup {
  letter: string;
  entries: BookEntryRef[];
}

export interface BookModel {
  snapshot: OpenBookSnapshot;
  chapters: BookChapterModel[];
  /** Every entry in book order. */
  entries: BookEntryRef[];
  byId: Map<string, BookEntryRef>;
  /** An entry's title, else the snapshot's name for a cited id, else null. */
  nameFor(id: string): string | null;
  childrenOf(placeId: string): OpenBookPlace[];
  /** Root first; only ancestors that are in the book. */
  ancestorsOf(placeId: string): OpenBookPlace[];
  peopleAt(placeId: string): OpenBookPerson[];
  deitiesOf(pantheonId: string): OpenBookDeity[];
  /** Entries whose rich text cites `id` through a mention, in book order. */
  backlinks(id: string): BookEntryRef[];
  /** The ties of an entry read from its own side, grouped as on the sheet; empty for a release without `ties`. */
  connectionsOf(id: string): BookConnectionGroup[];
  index: BookIndexGroup[];
}

function ref(
  kind: BookEntryKind,
  chapter: OpenBookChapter,
  id: string,
  title: string,
  subtitle: string | null,
): BookEntryRef {
  return { kind, chapter, id, title, subtitle, path: `${chapter}/${id}` };
}

function orNull(value: string | null | undefined): string | null {
  return value ? value : null;
}

/** Places depth-first by the place tree. Roots have no parent, or a parent the book does not hold. */
function orderPlaces(places: OpenBookPlace[], children: Map<string, OpenBookPlace[]>): OpenBookPlace[] {
  const ids = new Set(places.map((p) => p.id));
  const seen = new Set<string>();
  const out: OpenBookPlace[] = [];
  const visit = (place: OpenBookPlace) => {
    if (seen.has(place.id)) return;
    seen.add(place.id);
    out.push(place);
    for (const child of children.get(place.id) ?? []) visit(child);
  };
  for (const place of places) {
    if (place.parent_id === null || !ids.has(place.parent_id)) visit(place);
  }
  // A parent cycle has no root; keep its places rather than lose them.
  for (const place of places) visit(place);
  return out;
}

function sessionSortKey(s: OpenBookSession): [number, string] {
  return [s.session?.number ?? Number.POSITIVE_INFINITY, s.real_date ?? s.created_at];
}

function orderSessions(sessions: OpenBookSession[]): OpenBookSession[] {
  return [...sessions].sort((a, b) => {
    const [an, ad] = sessionSortKey(a);
    const [bn, bd] = sessionSortKey(b);
    if (an !== bn) return an < bn ? -1 : 1;
    return ad < bd ? -1 : ad > bd ? 1 : 0;
  });
}

/** Every `entityMention` id in a stored document. */
function mentionedIds(content: string | null): Set<string> {
  const found = new Set<string>();
  const walk = (node: unknown) => {
    if (typeof node !== "object" || node === null) return;
    if (Array.isArray(node)) {
      node.forEach(walk);
      return;
    }
    const rec = node as Record<string, unknown>;
    if (rec.type === "entityMention" && typeof rec.attrs === "object" && rec.attrs !== null) {
      const id = (rec.attrs as Record<string, unknown>).id;
      if (typeof id === "string" && id) found.add(id);
    }
    walk(rec.content);
  };
  if (content) walk(parseStoredContent(content));
  return found;
}

function indexLetter(title: string): string {
  const stripped = title.trim().replace(/^the\s+/i, "");
  const first = stripped.normalize("NFD").replace(/[̀-ͯ]/g, "").charAt(0).toUpperCase();
  return /^[A-Z]$/.test(first) ? first : "#";
}

function indexSortKey(title: string): string {
  return title.trim().replace(/^the\s+/i, "");
}

export function buildBookModel(snapshot: OpenBookSnapshot): BookModel {
  const included = new Set<OpenBookChapter>(snapshot.book.chapters);

  const placeChildren = new Map<string, OpenBookPlace[]>();
  const placeIds = new Set(snapshot.places.map((p) => p.id));
  const placeById = new Map(snapshot.places.map((p) => [p.id, p]));
  for (const place of snapshot.places) {
    if (place.parent_id !== null && placeIds.has(place.parent_id)) {
      const siblings = placeChildren.get(place.parent_id) ?? [];
      siblings.push(place);
      placeChildren.set(place.parent_id, siblings);
    }
  }

  const peopleByPlace = new Map<string, OpenBookPerson[]>();
  for (const person of snapshot.folk) {
    if (person.location_id === null) continue;
    const here = peopleByPlace.get(person.location_id) ?? [];
    here.push(person);
    peopleByPlace.set(person.location_id, here);
  }

  const deitiesByPantheon = new Map<string, OpenBookDeity[]>();
  const pantheonIds = new Set(snapshot.pantheons.map((p) => p.id));
  for (const deity of snapshot.deities) {
    if (deity.pantheon_id === null) continue;
    const list = deitiesByPantheon.get(deity.pantheon_id) ?? [];
    list.push(deity);
    deitiesByPantheon.set(deity.pantheon_id, list);
  }

  // Entries per chapter, and the rich text each one carries (for backlinks).
  const chapterEntries = new Map<OpenBookChapter, BookEntryRef[]>();
  const richText = new Map<string, string | null>();

  const atlas = orderPlaces(snapshot.places, placeChildren).map((p) => {
    richText.set(p.id, p.description);
    return ref("place", "atlas", p.id, p.name, orNull(p.location_type));
  });
  chapterEntries.set("atlas", atlas);

  chapterEntries.set(
    "folk",
    snapshot.folk.map((p) => ref("person", "folk", p.id, p.name, orNull(p.occupation) ?? orNull(p.race))),
  );

  chapterEntries.set(
    "factions",
    snapshot.factions.map((f) => {
      richText.set(f.id, f.description);
      return ref("faction", "factions", f.id, f.name, orNull(f.faction_type));
    }),
  );

  const pantheon: BookEntryRef[] = [];
  const deityEntry = (d: OpenBookDeity) => {
    richText.set(d.id, d.description);
    pantheon.push(ref("deity", "pantheon", d.id, d.name, orNull(d.titles)));
  };
  for (const p of snapshot.pantheons) {
    richText.set(p.id, p.description);
    pantheon.push(ref("pantheon", "pantheon", p.id, p.name, null));
    for (const d of deitiesByPantheon.get(p.id) ?? []) deityEntry(d);
  }
  for (const d of snapshot.deities) {
    if (d.pantheon_id === null || !pantheonIds.has(d.pantheon_id)) deityEntry(d);
  }
  chapterEntries.set("pantheon", pantheon);

  chapterEntries.set(
    "lore",
    snapshot.lore.map((l) => {
      richText.set(l.id, l.content);
      return ref("lore", "lore", l.id, l.title, orNull(l.category));
    }),
  );

  chapterEntries.set(
    "chronicle",
    orderSessions(snapshot.sessions).map((s) => {
      richText.set(s.id, s.content);
      const number = s.session?.number ?? null;
      return ref(
        "session",
        "chronicle",
        s.id,
        orNull(s.session?.title) ?? s.title,
        number === null ? null : `Session ${number}`,
      );
    }),
  );

  const chapters: BookChapterModel[] = [];
  for (const chapter of OPEN_BOOK_CHAPTERS) {
    if (!included.has(chapter)) continue;
    const entries = chapterEntries.get(chapter) ?? [];
    if (entries.length === 0) continue;
    chapters.push({ chapter, ...CHAPTER_META[chapter], entries });
  }

  const entries = chapters.flatMap((c) => c.entries);
  const byId = new Map(entries.map((e) => [e.id, e]));

  // Backlinks: cited id -> the entries that cite it, in book order, never an entry citing itself.
  const cited = new Map<string, BookEntryRef[]>();
  for (const entry of entries) {
    for (const id of mentionedIds(richText.get(entry.id) ?? null)) {
      if (id === entry.id) continue;
      const list = cited.get(id) ?? [];
      list.push(entry);
      cited.set(id, list);
    }
  }

  const groups = new Map<string, BookEntryRef[]>();
  for (const entry of entries) {
    const letter = indexLetter(entry.title);
    const list = groups.get(letter) ?? [];
    list.push(entry);
    groups.set(letter, list);
  }
  const index: BookIndexGroup[] = [...groups.entries()]
    .sort(([a], [b]) => (a === "#" ? 1 : b === "#" ? -1 : a < b ? -1 : a > b ? 1 : 0))
    .map(([letter, list]) => ({
      letter,
      entries: [...list].sort((a, b) => indexSortKey(a.title).localeCompare(indexSortKey(b.title))),
    }));

  const connectionsOf = connectionsFromTies(readTies(snapshot), byId);

  return {
    snapshot,
    chapters,
    entries,
    byId,
    nameFor: (id) => byId.get(id)?.title ?? snapshot.names[id] ?? null,
    childrenOf: (placeId) => placeChildren.get(placeId) ?? [],
    ancestorsOf: (placeId) => {
      const out: OpenBookPlace[] = [];
      const seen = new Set<string>([placeId]);
      let parentId = placeById.get(placeId)?.parent_id ?? null;
      while (parentId !== null && !seen.has(parentId)) {
        const parent = placeById.get(parentId);
        if (!parent) break;
        seen.add(parentId);
        out.unshift(parent);
        parentId = parent.parent_id;
      }
      return out;
    },
    peopleAt: (placeId) => peopleByPlace.get(placeId) ?? [],
    deitiesOf: (pantheonId) => deitiesByPantheon.get(pantheonId) ?? [],
    backlinks: (id) => cited.get(id) ?? [],
    connectionsOf,
    index,
  };
}
