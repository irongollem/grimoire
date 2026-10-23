/**
 * The rows of the Open Book's bulk picker ("Choose what goes in", #1085): every entry a DM could put in the book,
 * built from the campaign's own lists, with the filters, per-chapter counts, bottom-bar arithmetic and the writes a
 * button press means. Pure, so a campaign with hundreds of entries is tested without a screen.
 *
 * The rules are `eligibility.ts`'s (a mirror of SQL): an entry can be in the book only when the whole party can
 * see it. `open_book_entries` only ever holds exceptions to the book's default, so putting an entry in clears its
 * row when the default already includes it, and writes `included: true` only when it does not (and the reverse).
 */
import { isInBook, npcBookBlock, npcSharingPlaceIds, wholeParty } from "@/lib/openBook/eligibility";
import type { OpenBookChapter, OpenBookEntityType, OpenBookEntry } from "@/types/openBook.types";

export interface PickerPlace {
  id: string;
  parent_id: string | null;
  name: string;
  player_visible_to: readonly string[] | null;
  /** The place lets the party see its residents, which can put them in the book without being told directly. */
  is_npcs_shared: boolean;
}
export interface PickerNpc {
  id: string;
  name: string;
  location_id: string | null;
  player_visible_to: readonly string[] | null;
  player_visible_fields: readonly string[];
}
export interface PickerNamed {
  id: string;
  name: string;
  player_visible_to: readonly string[] | null;
}
export interface PickerDeity extends PickerNamed {
  pantheon?: { name: string } | null;
}
export interface PickerNote {
  id: string;
  title: string;
  category: string;
  player_visible_to: readonly string[] | null;
}

export interface PickerSources {
  locations: readonly PickerPlace[];
  npcs: readonly PickerNpc[];
  factions: readonly PickerNamed[];
  pantheons: readonly PickerNamed[];
  deities: readonly PickerDeity[];
  notes: readonly PickerNote[];
}

/** Who can see the entry at the DM's table: all of the party, some of it, or nobody but the DM. */
export type PickerAudience = "party" | "some" | "me";

export interface PickerRow {
  /** `type:id`; the same uuid can appear under two types, so a bare id is not a key. */
  key: string;
  type: OpenBookEntityType;
  id: string;
  chapter: OpenBookChapter;
  name: string;
  /** A second line under the name: a deity's pantheon, a note's category. */
  detail: string | null;
  /** Indent level in the Atlas tree; 0 everywhere else. */
  depth: number;
  /** The place this entry sits in or is: a place's own id, an NPC's home. Null for the rest. */
  placeId: string | null;
  visibleTo: readonly string[];
  audience: PickerAudience;
  /** It may go in the book: the whole party can see it (an NPC also needs a shared name; see `npcBookBlock`). */
  eligible: boolean;
  /** An NPC whose name is not shared: sharing with the party alone would not make them eligible. */
  nameHidden: boolean;
  /** The DM's own choice for this entry, absent when it follows the book's default. */
  choice: boolean | undefined;
  inBook: boolean;
}

export function rowKey(type: OpenBookEntityType, id: string): string {
  return `${type}:${id}`;
}

export function audienceOf(visibleTo: readonly string[], partyIds: readonly string[]): PickerAudience {
  if (wholeParty(visibleTo, partyIds)) return "party";
  return visibleTo.length > 0 ? "some" : "me";
}

export function chapterOfNote(category: string): OpenBookChapter {
  return category === "session" ? "chronicle" : "lore";
}

export interface PickerBook {
  includeShared: boolean;
}

/** Atlas order: roots by name, each followed by its children. A parent missing from the list makes a root. */
function placeOrder(places: readonly PickerPlace[]): { place: PickerPlace; depth: number }[] {
  const byId = new Map(places.map((p) => [p.id, p]));
  const kids = new Map<string | null, PickerPlace[]>();
  for (const p of places) {
    const parent = p.parent_id !== null && byId.has(p.parent_id) && p.parent_id !== p.id ? p.parent_id : null;
    const list = kids.get(parent) ?? [];
    list.push(p);
    kids.set(parent, list);
  }
  for (const list of kids.values()) list.sort((a, b) => a.name.localeCompare(b.name));
  const out: { place: PickerPlace; depth: number }[] = [];
  const seen = new Set<string>();
  const walk = (parent: string | null, depth: number) => {
    for (const place of kids.get(parent) ?? []) {
      if (seen.has(place.id)) continue;
      seen.add(place.id);
      out.push({ place, depth });
      walk(place.id, depth + 1);
    }
  };
  walk(null, 0);
  // A parent cycle has no root to walk from; keep those places reachable rather than silently dropping them.
  for (const p of places) {
    if (!seen.has(p.id)) {
      seen.add(p.id);
      out.push({ place: p, depth: 0 });
      walk(p.id, 1);
    }
  }
  return out;
}

export function buildPickerRows(
  sources: PickerSources,
  entries: readonly Pick<OpenBookEntry, "entity_type" | "entity_id" | "included">[],
  book: PickerBook,
  partyIds: readonly string[],
): PickerRow[] {
  const sharingPlaces = npcSharingPlaceIds(sources.locations, partyIds);
  const choices = new Map(entries.map((e) => [rowKey(e.entity_type, e.entity_id), e.included]));

  const make = (
    type: OpenBookEntityType,
    id: string,
    chapter: OpenBookChapter,
    name: string,
    visible: readonly string[] | null,
    extra: { detail?: string | null; depth?: number; placeId?: string | null; npc?: PickerNpc } = {},
  ): PickerRow => {
    const visibleTo = visible ?? [];
    const block = extra.npc ? npcBookBlock(extra.npc, partyIds, sharingPlaces) : null;
    const eligible = extra.npc ? block === null : wholeParty(visibleTo, partyIds);
    const key = rowKey(type, id);
    const choice = choices.get(key);
    return {
      key,
      type,
      id,
      chapter,
      name,
      detail: extra.detail ?? null,
      depth: extra.depth ?? 0,
      placeId: extra.placeId ?? null,
      visibleTo,
      // An NPC seen through the place they live in reads as the whole party's, as at the table.
      audience: extra.npc && eligible ? "party" : audienceOf(visibleTo, partyIds),
      eligible,
      nameHidden: block === "name",
      choice,
      inBook: isInBook(eligible, choice, book.includeShared),
    };
  };

  const byName = <T extends { name: string }>(list: readonly T[]) =>
    [...list].sort((a, b) => a.name.localeCompare(b.name));

  return [
    ...placeOrder(sources.locations).map(({ place, depth }) =>
      make("location", place.id, "atlas", place.name, place.player_visible_to, { depth, placeId: place.id }),
    ),
    ...byName(sources.npcs).map((n) =>
      make("npc", n.id, "folk", n.name, n.player_visible_to, { placeId: n.location_id, npc: n }),
    ),
    ...byName(sources.factions).map((f) => make("faction", f.id, "factions", f.name, f.player_visible_to)),
    ...byName(sources.pantheons).map((p) => make("pantheon", p.id, "pantheon", p.name, p.player_visible_to)),
    ...byName(sources.deities).map((d) =>
      make("deity", d.id, "pantheon", d.name, d.player_visible_to, { detail: d.pantheon?.name ?? null }),
    ),
    ...[...sources.notes]
      .sort((a, b) => a.title.localeCompare(b.title))
      .map((n) =>
        make("note", n.id, chapterOfNote(n.category), n.title, n.player_visible_to, {
          detail: n.category === "session" ? null : n.category,
        }),
      ),
  ];
}

/** A place plus everything under it. Unknown ids give just themselves. */
export function placeSubtreeIds(places: readonly Pick<PickerPlace, "id" | "parent_id">[], rootId: string): Set<string> {
  const kids = new Map<string, string[]>();
  for (const p of places) {
    if (p.parent_id === null) continue;
    const list = kids.get(p.parent_id) ?? [];
    list.push(p.id);
    kids.set(p.parent_id, list);
  }
  const out = new Set<string>([rootId]);
  const stack = [rootId];
  while (stack.length > 0) {
    for (const child of kids.get(stack.pop()!) ?? []) {
      if (!out.has(child)) {
        out.add(child);
        stack.push(child);
      }
    }
  }
  return out;
}

export type AudienceFilter = "any" | PickerAudience;

export interface PickerFilter {
  /** Null shows every chapter. */
  chapter: OpenBookChapter | null;
  search: string;
  /** Ids of the places an entry must sit in or under; null for no place filter. Entries with no place drop out. */
  placeIds: ReadonlySet<string> | null;
  audience: AudienceFilter;
  notInBook: boolean;
}

export const NO_FILTER: PickerFilter = {
  chapter: null,
  search: "",
  placeIds: null,
  audience: "any",
  notInBook: false,
};

export function hasActiveFilters(filter: PickerFilter): boolean {
  return (
    filter.search.trim() !== "" || filter.placeIds !== null || filter.audience !== "any" || filter.notInBook
  );
}

export function filterRows(rows: readonly PickerRow[], filter: PickerFilter): PickerRow[] {
  const needle = filter.search.trim().toLowerCase();
  const filtering = needle !== "" || filter.placeIds !== null || filter.audience !== "any" || filter.notInBook;
  return rows.filter((row) => {
    if (filter.chapter !== null && row.chapter !== filter.chapter) return false;
    if (needle !== "" && !row.name.toLowerCase().includes(needle)) return false;
    if (filter.placeIds !== null && (row.placeId === null || !filter.placeIds.has(row.placeId))) return false;
    if (filter.audience !== "any" && row.audience !== filter.audience) return false;
    if (filter.notInBook && row.inBook) return false;
    return true;
  }).map((row) => (filtering && row.depth > 0 ? { ...row, depth: 0 } : row));
}

export interface ChapterCount {
  inBook: number;
  total: number;
}

/** Per chapter, how many entries are in the book out of all of them. */
export function chapterCounts(rows: readonly PickerRow[]): Record<OpenBookChapter, ChapterCount> {
  const counts: Record<OpenBookChapter, ChapterCount> = {
    atlas: { inBook: 0, total: 0 },
    folk: { inBook: 0, total: 0 },
    factions: { inBook: 0, total: 0 },
    pantheon: { inBook: 0, total: 0 },
    lore: { inBook: 0, total: 0 },
    chronicle: { inBook: 0, total: 0 },
  };
  for (const row of rows) {
    counts[row.chapter].total += 1;
    if (row.inBook) counts[row.chapter].inBook += 1;
  }
  return counts;
}

export function allChaptersCount(counts: Record<OpenBookChapter, ChapterCount>): ChapterCount {
  return Object.values(counts).reduce(
    (sum, c) => ({ inBook: sum.inBook + c.inBook, total: sum.total + c.total }),
    { inBook: 0, total: 0 },
  );
}

export interface SelectionSummary {
  selected: number;
  /** Selected entries the whole party cannot see yet. */
  notShared: number;
  /** Selected entries that may go in as they are. */
  canGoIn: number;
}

/** The bottom bar's numbers: "N selected · M are not ready for the book yet", "Add the K that can go in". */
export function summariseSelection(rows: readonly PickerRow[], selected: ReadonlySet<string>): SelectionSummary {
  let count = 0;
  let notShared = 0;
  for (const row of rows) {
    if (!selected.has(row.key)) continue;
    count += 1;
    if (!row.eligible) notShared += 1;
  }
  return { selected: count, notShared, canGoIn: count - notShared };
}

/** What to do to `open_book_entries` for one kind of entry: write `included` on these, delete the row of those. */
export interface EntryWrites {
  type: OpenBookEntityType;
  upsertIds: string[];
  clearIds: string[];
}

/**
 * The writes that make every given row's choice say `want` (in or out), touching nothing that already does:
 * a choice equal to the book's default is not stored (so `want === includeShared` clears), anything else is.
 */
export function planEntryWrites(rows: readonly PickerRow[], want: boolean, includeShared: boolean): EntryWrites[] {
  const byType = new Map<OpenBookEntityType, EntryWrites>();
  for (const row of rows) {
    const writes = byType.get(row.type) ?? { type: row.type, upsertIds: [], clearIds: [] };
    if (want === includeShared) {
      if (row.choice !== undefined) writes.clearIds.push(row.id);
    } else if (row.choice !== want) {
      writes.upsertIds.push(row.id);
    }
    byType.set(row.type, writes);
  }
  return [...byType.values()].filter((w) => w.upsertIds.length > 0 || w.clearIds.length > 0);
}

/** Selected rows grouped by entity type, for the share-with-party write. */
export function idsByType(rows: readonly PickerRow[]): Map<OpenBookEntityType, string[]> {
  const out = new Map<OpenBookEntityType, string[]>();
  for (const row of rows) {
    const list = out.get(row.type) ?? [];
    list.push(row.id);
    out.set(row.type, list);
  }
  return out;
}
