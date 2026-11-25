import { CANON_SECTIONS, sectionOfPart, type CanonSectionId } from "@/lib/canon/canonParts";
import { tiptapToPlainText } from "@/lib/tiptap/tiptapText";
import type { CanonArc } from "@/composables/canon/useCanonArcs";
import type { StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonClue, CanonEntry, CanonForceStep, CanonLorePassage } from "@/types/canon.types";

/** The words contain the query, any case. An empty or blank query matches everything. */
export function matchesQuery(text: string, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || text.toLowerCase().includes(needle);
}

/** Where a hit opens: a chapter and the query that picks the thing in it. */
export interface CanonHitLink {
  path: string;
  query: Record<string, string>;
}

/** One place the query was found: an entry itself, a clue, step or passage that belongs to one, or an arc, a people, a habitat or a line the table added. */
export interface CanonHit {
  /** Unique on the page. */
  key: string;
  /** What the hit opens: an entry (`/canon/<part>?entry=<id>`; a clue opens its secret, a step its force, a passage its entry), an arc (`?arc=`), a people (`?people=`), a habitat (`?habitat=`) or the Truths chapter for a table line. */
  to: CanonHitLink;
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
  arcs: readonly Pick<CanonArc, "id" | "name" | "summary" | "question">[];
  /** The peoples: `body` is a rich-text document as text. */
  peoples: readonly { id: string; name: string; body: string | null }[];
  /** The habitats: `description` is a rich-text document as text. */
  habitats: readonly { id: string; name: string; description: string | null }[];
  /** The record's facts; only the table's own, not struck, are searched. */
  facts: readonly Pick<StoryFact, "id" | "body" | "source" | "struck_at">[];
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
export function searchCanon(query: string, { entries, clues, steps, passages, arcs, peoples, habitats, facts }: CanonSearchSources): CanonHitGroup[] {
  if (query.trim() === "") return [];
  const byId = new Map(entries.map((e) => [e.id, e]));
  const found = new Map<CanonSectionId, CanonHit[]>();
  const onEntry = (section: CanonSectionId, id: string): CanonHitLink => ({ path: `/canon/${section}`, query: { entry: id } });
  const add = (section: CanonSectionId, hit: CanonHit) => found.set(section, [...(found.get(section) ?? []), hit]);

  for (const entry of entries) {
    const inTitle = matchesQuery(entry.title, query);
    const excerpt = inTitle ? null : excerptAround(entry.body, query);
    if (!inTitle && excerpt === null) continue;
    add(sectionOfPart(entry.part), { key: `entry-${entry.id}`, to: onEntry(sectionOfPart(entry.part), entry.id), title: entry.title, kind: null, of: null, excerpt });
  }
  for (const clue of clues) {
    const secret = byId.get(clue.secret_id);
    if (secret && matchesQuery(clue.title, query)) add(sectionOfPart(secret.part), { key: `clue-${clue.id}`, to: onEntry(sectionOfPart(secret.part), secret.id), title: clue.title, kind: "Clue", of: secret.title, excerpt: null });
  }
  for (const step of steps) {
    const force = byId.get(step.force_id);
    if (force && matchesQuery(step.title, query)) add(sectionOfPart(force.part), { key: `step-${step.id}`, to: onEntry(sectionOfPart(force.part), force.id), title: step.title, kind: "Step", of: force.title, excerpt: null });
  }
  for (const passage of passages) {
    const entry = byId.get(passage.entry_id);
    if (!entry) continue;
    const inTitle = matchesQuery(passage.title, query);
    const excerpt = inTitle ? null : excerptAround(passage.body, query);
    if (!inTitle && excerpt === null) continue;
    add(sectionOfPart(entry.part), { key: `passage-${passage.id}`, to: onEntry(sectionOfPart(entry.part), entry.id), title: passage.title, kind: "Passage", of: entry.title, excerpt });
  }

  for (const arc of arcs) {
    const inName = matchesQuery(arc.name, query);
    const excerpt = inName ? null : (excerptAround(arc.summary, query) ?? excerptAround(arc.question, query));
    if (!inName && excerpt === null) continue;
    add("arcs", { key: `arc-${arc.id}`, to: { path: "/canon/arcs", query: { arc: arc.id } }, title: arc.name, kind: null, of: null, excerpt });
  }
  for (const people of peoples) {
    const inName = matchesQuery(people.name, query);
    const excerpt = inName ? null : excerptAround(people.body, query);
    if (!inName && excerpt === null) continue;
    add("peoples", { key: `people-${people.id}`, to: { path: "/canon/peoples", query: { people: people.id } }, title: people.name, kind: null, of: null, excerpt });
  }
  for (const habitat of habitats) {
    const inName = matchesQuery(habitat.name, query);
    const excerpt = inName ? null : excerptAround(habitat.description, query);
    if (!inName && excerpt === null) continue;
    add("life", { key: `habitat-${habitat.id}`, to: { path: "/canon/life", query: { habitat: habitat.id } }, title: habitat.name, kind: null, of: null, excerpt });
  }
  // What the table added is reviewed on Truths; a struck line never happened, so it is not found.
  for (const fact of facts) {
    if (fact.source !== "table" || fact.struck_at !== null || !matchesQuery(fact.body, query)) continue;
    add("truths", { key: `fact-${fact.id}`, to: { path: "/canon/truths", query: { fact: fact.id } }, title: fact.body, kind: "Table line", of: null, excerpt: null });
  }

  return CANON_SECTIONS.flatMap((s) => {
    const hits = found.get(s.id);
    return hits ? [{ section: s.id, label: s.label, hits }] : [];
  });
}
