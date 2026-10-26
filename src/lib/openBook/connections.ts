/**
 * The ties between a release's entries, read from an entry's own side (#1084).
 *
 * The snapshot's optional `ties` key lists every tie between two entries that are both in the release and that the
 * whole party knows. It is untrusted-shaped JSON, and a release made before the key existed has none, so every
 * read here narrows what it finds and treats a missing or malformed key as "no ties".
 */

import type { LinkKind } from "@edge-shared/worldLinkCatalogue.ts";
import { CONNECTION_GROUP_TITLES, connectionWord, groupByKind, type ConnectionGroup } from "@/lib/worldLinks/connections";
import type { BookEntryKind, BookEntryRef } from "@/lib/openBook/bookModel";
import type { OpenBookSnapshot } from "@/types/openBook.types";

export interface BookTie {
  source: string;
  type: string;
  fromKind: LinkKind;
  fromId: string;
  toKind: LinkKind;
  toId: string;
  told: string | null;
}

/** The catalogue kind each kind of entry stands for; pantheons, lore and sessions hold no ties. */
const KIND_OF_ENTRY: Partial<Record<BookEntryKind, LinkKind>> = {
  place: "location",
  person: "npc",
  faction: "faction",
  deity: "deity",
};

const BOOK_LINK_KINDS: readonly LinkKind[] = ["location", "npc", "faction", "deity"];

function isBookKind(value: unknown): value is LinkKind {
  return typeof value === "string" && (BOOK_LINK_KINDS as readonly string[]).includes(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The snapshot's ties that read cleanly; a tie that does not is dropped, and a release without the key has none. */
export function readTies(snapshot: OpenBookSnapshot): BookTie[] {
  const raw = (snapshot as unknown as Record<string, unknown>).ties;
  if (!Array.isArray(raw)) return [];
  const out: BookTie[] = [];
  for (const item of raw) {
    if (!isRecord(item)) continue;
    const { source, type, from_kind, from_id, to_kind, to_id, told } = item;
    if (typeof source !== "string" || typeof type !== "string" || type === "") continue;
    if (!isBookKind(from_kind) || !isBookKind(to_kind)) continue;
    if (typeof from_id !== "string" || typeof to_id !== "string" || from_id === to_id) continue;
    out.push({
      source,
      type,
      fromKind: from_kind,
      fromId: from_id,
      toKind: to_kind,
      toId: to_id,
      told: typeof told === "string" && told.trim() !== "" ? told.trim() : null,
    });
  }
  return out;
}

export interface BookConnection {
  /** The far entry. */
  entry: BookEntryRef;
  /** What the page's own entry is to it: "worships", "member of", "parent of". */
  word: string;
  told: string | null;
}

export interface BookConnectionGroup {
  group: ConnectionGroup;
  title: string;
  lines: BookConnection[];
}

interface GroupedLine extends BookConnection {
  kind: LinkKind;
}

/** Ties filed under the entry at each end, so a page reads its own with one call. Ties to an entry the book lacks are dropped. */
export function connectionsFromTies(
  ties: readonly BookTie[],
  byId: ReadonlyMap<string, BookEntryRef>,
): (id: string) => BookConnectionGroup[] {
  const perEntry = new Map<string, GroupedLine[]>();
  const seen = new Set<string>();

  const file = (selfId: string, selfKind: LinkKind, tie: BookTie, outward: boolean) => {
    const otherId = outward ? tie.toId : tie.fromId;
    const otherKind = outward ? tie.toKind : tie.fromKind;
    const other = byId.get(otherId);
    if (!other || KIND_OF_ENTRY[other.kind] !== otherKind) return;
    const key = `${selfId}|${tie.type}|${outward}|${otherId}`;
    if (seen.has(key)) return;
    seen.add(key);
    const word = connectionWord({ type: tie.type, outward, other_kind: otherKind }, selfKind);
    const list = perEntry.get(selfId) ?? [];
    list.push({ entry: other, word, told: tie.told, kind: otherKind });
    perEntry.set(selfId, list);
  };

  for (const tie of ties) {
    const from = byId.get(tie.fromId);
    const to = byId.get(tie.toId);
    if (!from || !to) continue;
    if (KIND_OF_ENTRY[from.kind] === tie.fromKind) file(tie.fromId, tie.fromKind, tie, true);
    if (KIND_OF_ENTRY[to.kind] === tie.toKind) file(tie.toId, tie.toKind, tie, false);
  }

  return (id) => {
    const lines = perEntry.get(id);
    if (!lines) return [];
    return groupByKind(lines, (l) => l.kind).map(({ group, items }) => ({
      group,
      title: CONNECTION_GROUP_TITLES[group],
      lines: items
        .map(({ entry, word, told }) => ({ entry, word, told }))
        .sort((a, b) => a.word.localeCompare(b.word) || a.entry.title.localeCompare(b.entry.title)),
    }));
  };
}
