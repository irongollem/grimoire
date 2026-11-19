/**
 * The story so far (#1021): the campaign's record of plain facts, laid out for reading and correcting.
 *
 * A fact is never rewritten. A later fact `supersedes` the one it closes, and both stay, so the page shows a closed
 * fact struck through with the fact that overtook it directly after, and a player's correction is exactly such a
 * later fact. Everything here is pure: the reads and writes live in `composables/table/useStoryRecord*.ts`.
 */
import { sessionLabel } from "@/lib/sessions/sessionLabel";

export type FactSource = "table" | "dm" | "correction";
export type LinkKind = "npc" | "location" | "quest" | "quest_beat" | "item" | "monster";

export const FACT_MAX_LENGTH = 600;

export interface StoryFact {
  id: string;
  campaign_id: string;
  session_id: string | null;
  body: string;
  known_to_player: boolean;
  supersedes_id: string | null;
  source: FactSource;
  created_at: string;
}

/** Exactly one target column is set, named by `kind`. */
export interface StoryFactLink {
  id: string;
  fact_id: string;
  campaign_id: string;
  kind: LinkKind;
  npc_id: string | null;
  location_id: string | null;
  quest_id: string | null;
  quest_beat_id: string | null;
  item_id: string | null;
  monster_id: string | null;
}

export interface SittingInfo {
  id: string;
  number: number | null;
  title: string | null;
  /** The day it was played, when the DM logged one. */
  played_on: string | null;
  started_at: string | null;
}

export interface RecordEntry {
  fact: StoryFact;
  /** A later fact has overtaken it. */
  closed: boolean;
}

export interface RecordGroup {
  /** The sitting's id; null for facts filed outside any sitting. */
  key: string | null;
  label: string;
  /** ISO day or timestamp the heading shows; null when nothing dates the group. */
  date: string | null;
  entries: RecordEntry[];
}

const byFiled = (a: StoryFact, b: StoryFact): number =>
  a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0;

/**
 * Facts in chains: an original, then what overtook it, then what overtook that. A chain's first fact is one whose
 * predecessor is not in `facts` (a root, or one whose predecessor the reader cannot see). If two facts overtook the
 * same one (two people correcting at once) both follow it, oldest first. Chains are ordered by when their root was
 * filed. Cycles cannot be built (a fact cannot name itself) but a malformed set must not loop forever.
 */
export function factChains(facts: readonly StoryFact[]): RecordEntry[][] {
  const ids = new Set(facts.map((f) => f.id));
  const successors = new Map<string, StoryFact[]>();
  for (const fact of facts) {
    if (fact.supersedes_id !== null && ids.has(fact.supersedes_id)) {
      const list = successors.get(fact.supersedes_id) ?? [];
      list.push(fact);
      successors.set(fact.supersedes_id, list);
    }
  }
  const roots = facts.filter((f) => f.supersedes_id === null || !ids.has(f.supersedes_id)).sort(byFiled);

  const seen = new Set<string>();
  const walk = (fact: StoryFact, into: RecordEntry[]): void => {
    if (seen.has(fact.id)) return;
    seen.add(fact.id);
    const next = (successors.get(fact.id) ?? []).sort(byFiled);
    into.push({ fact, closed: next.length > 0 });
    for (const successor of next) walk(successor, into);
  };
  return roots.map((root) => {
    const chain: RecordEntry[] = [];
    walk(root, chain);
    return chain;
  });
}

/** A fact's sentence matches when it contains the words typed, whatever the case. Empty matches everything. */
export function factMatches(fact: Pick<StoryFact, "body">, query: string): boolean {
  const needle = query.trim().toLowerCase();
  return needle === "" || fact.body.toLowerCase().includes(needle);
}

/**
 * The record grouped by sitting, newest sitting first, "outside a sitting" last. A chain stays whole and sits in the
 * sitting of its newest fact (where the story stands now), so a fact is always followed by what overtook it even
 * when that happened in a later sitting. A text filter keeps a chain whole when any fact in it matches, so a
 * struck-through predecessor never loses its successor or the other way round.
 *
 * A fact whose sitting the reader cannot read (a player cannot read the DM's session log) is grouped by that
 * sitting's id and labelled by the day it was filed.
 */
export function groupRecord(
  facts: readonly StoryFact[],
  sittings: ReadonlyMap<string, SittingInfo>,
  query = "",
): RecordGroup[] {
  const groups = new Map<string | null, { chains: RecordEntry[][]; newest: string; oldest: string }>();
  for (const chain of factChains(facts)) {
    if (!chain.some((entry) => factMatches(entry.fact, query))) continue;
    const head = chain[chain.length - 1]!.fact;
    const key = head.session_id;
    const group = groups.get(key) ?? { chains: [], newest: head.created_at, oldest: head.created_at };
    group.chains.push(chain);
    for (const { fact } of chain) {
      if (fact.created_at > group.newest) group.newest = fact.created_at;
      if (fact.created_at < group.oldest) group.oldest = fact.created_at;
    }
    groups.set(key, group);
  }

  const out = [...groups.entries()].map(([key, group]) => {
    const sitting = key === null ? undefined : sittings.get(key);
    const label = key === null ? "Outside a session" : sitting ? sessionLabel(sitting) : "A session";
    const date = sitting ? (sitting.played_on ?? sitting.started_at) : key === null ? null : group.oldest;
    return { key, label, date, entries: group.chains.flat(), newest: group.newest };
  });
  out.sort((a, b) => {
    if ((a.key === null) !== (b.key === null)) return a.key === null ? 1 : -1;
    return a.newest < b.newest ? 1 : a.newest > b.newest ? -1 : 0;
  });
  return out.map(({ newest: _newest, ...group }) => group);
}

/** What the page says about where a fact came from; the table's own filing is unmarked. */
export function factOrigin(source: FactSource): string | null {
  if (source === "correction") return "Corrected by the player";
  if (source === "dm") return "Added by hand";
  return null;
}

/** The record's links as the page can name them. Beats, items and monsters are kept on the record but not shown here. */
export interface FactAbout {
  kind: "npc" | "location" | "quest";
  id: string;
}

export function factAbout(links: readonly StoryFactLink[]): FactAbout[] {
  const out: FactAbout[] = [];
  for (const link of links) {
    if (link.kind === "npc" && link.npc_id) out.push({ kind: "npc", id: link.npc_id });
    else if (link.kind === "location" && link.location_id) out.push({ kind: "location", id: link.location_id });
    else if (link.kind === "quest" && link.quest_id) out.push({ kind: "quest", id: link.quest_id });
  }
  return out;
}

/** When a name cannot be read (a player may not read every record) the chip says what kind of thing it is. */
export const ABOUT_FALLBACK: Record<FactAbout["kind"], string> = {
  npc: "Someone",
  location: "A place",
  quest: "A quest",
};

export type CorrectionCheck = { ok: true; body: string } | { ok: false; reason: string };

/** A correction says something else, in words, within the record's limit. */
export function checkCorrection(original: string, typed: string): CorrectionCheck {
  const body = typed.trim();
  if (body === "") return { ok: false, reason: "Write what is true instead." };
  if (body.length > FACT_MAX_LENGTH) return { ok: false, reason: `Keep it to ${FACT_MAX_LENGTH} characters.` };
  if (body === original.trim()) return { ok: false, reason: "That is what the record already says." };
  return { ok: true, body };
}

/** A fact put on record by hand has the same limits without the "differs" rule. */
export function checkNewFact(typed: string): CorrectionCheck {
  const body = typed.trim();
  if (body === "") return { ok: false, reason: "Write what is true." };
  if (body.length > FACT_MAX_LENGTH) return { ok: false, reason: `Keep it to ${FACT_MAX_LENGTH} characters.` };
  return { ok: true, body };
}
