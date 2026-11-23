import { CANON_SECTIONS, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonClue, CanonEntry, CanonForceStep, CanonLorePassage } from "@/types/canon.types";

/** The words contain the query, any case. An empty or blank query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || text.toLowerCase().includes(needle);
}

/** One place the query was found: an entry itself, or a clue, step or passage that belongs to one. */
export interface CanonHit {
  /** Unique on the page. */
  key: string;
  /** The entry the link opens (`/canon/<part>?entry=<id>`): a clue opens its secret, a step its force, a passage its entry. */
  entryId: string;
  /** What matched: the entry's title, or the clue's, step's or passage's. */
  title: string;
  /** What kind of thing matched, when it is not the entry itself ("Clue", "Step", "Passage"). */
  kind: string | null;
  /** The entry the hit belongs to, when `title` is a clue, step or passage of it. */
  of: string | null;
  /** A line of the body around the match, when the words were found in a body and not in the title. */
  excerpt: string | null;
}

export interface CanonHitGroup {
  section: CanonSectionId;
  label: string;
  hits: CanonHit[];
}

export interface CanonSearchSources {
  entries: readonly CanonEntry[];
  clues: readonly CanonClue[];
  steps: readonly CanonForceStep[];
  passages: readonly CanonLorePassage[];
}

const EXCERPT_SPAN = 40;

/** The words around the first match in a body, trimmed to one line; null when the body does not hold the query. */
export function excerptAround(body: string | null, query: string): string | null {
  const needle = query.trim().toLowerCase();
  if (needle === "") return null;
  const text = tiptapToPlainText(body).replace(/\s+/g, " ");
  const at = text.toLowerCase().indexOf(needle);
  if (at === -1) return null;
  const from = Math.max(0, at - EXCERPT_SPAN);
  const to = Math.min(text.length, at + needle.length + EXCERPT_SPAN);
  return `${from > 0 ? "…" : ""}${text.slice(from, to).trim()}${to < text.length ? "…" : ""}`;
}

/**
 * The page's one search (#1258 item 21): every entry whose title or body holds the words, plus the clues, force steps
 * and lore passages that do, grouped by the part they sit in, in the contents column's order. A clue, a step and a
 * passage hit opens the entry it belongs to; one whose entry is not in `entries` (an arc narrowed it away, or it is
 * gone) is left out. A blank query finds nothing: the page then shows its part, not a list of everything.
 */
export function searchCanon(query: string, { entries, clues, steps, passages }: CanonSearchSources): CanonHitGroup[] {
  if (query.trim() === "") return [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const found = new Map<CanonSectionId, CanonHit[]>();
  const add = (section: CanonSectionId, hit: CanonHit) => found.set(section, [...(found.get(section) ?? []), hit]);

  for (const entry of entries) {
    const inTitle = matchesQuery(entry.title, query);
    const excerpt = inTitle ? null : excerptAround(entry.body, query);
    if (!inTitle && excerpt === null) continue;
    add(sectionOfPart(entry.part), { key: `entry-${entry.id}`, entryId: entry.id, title: entry.title, kind: null, of: null, excerpt });
  }
  for (const clue of clues) {
    const secret = byId.get(clue.secret_id);
    if (secret && matchesQuery(clue.title, query)) add(sectionOfPart(secret.part), { key: `clue-${clue.id}`, entryId: secret.id, title: clue.title, kind: "Clue", of: secret.title, excerpt: null });
  }
  for (const step of steps) {
    const force = byId.get(step.force_id);
    if (force && matchesQuery(step.title, query)) add(sectionOfPart(force.part), { key: `step-${step.id}`, entryId: force.id, title: step.title, kind: "Step", of: force.title, excerpt: null });
  }
  for (const passage of passages) {
    const entry = byId.get(passage.entry_id);
    if (!entry) continue;
    const inTitle = matchesQuery(passage.title, query);
    const excerpt = inTitle ? null : excerptAround(passage.body, query);
    if (!inTitle && excerpt === null) continue;
    add(sectionOfPart(entry.part), { key: `passage-${passage.id}`, entryId: entry.id, title: passage.title, kind: "Passage", of: entry.title, excerpt });
  }

  return CANON_SECTIONS.flatMap((s) => {
    const hits = found.get(s.id);
    return hits ? [{ section: s.id, label: s.label, hits }] : [];
  });
}
