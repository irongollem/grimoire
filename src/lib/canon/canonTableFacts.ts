import { factChains, groupRecord, type RecordGroup, type SittingInfo, type StoryFact } from "@/lib/table/solo/storyRecord";
import type { CanonEntry, KnowledgeMark } from "@/types/canon.types";

/**
 * What the table added (#1226, frame 03): the facts the Narrator put on record (`story_facts.source = 'table'`) and the
 * DM's review of them. Pure; the reads and writes live in `composables/canon/useTableFacts.ts`.
 */

/** Where a fact stands in the DM's review. A fact the DM has not yet looked at is `new`. */
export type FactReview = "new" | "kept" | "struck" | "corrected";

/**
 * The review of one fact in its chain. Struck wins over everything (it never happened); a fact a later fact has
 * overtaken is `corrected`; a fact the DM kept, or the DM's own correction, is `kept`; the rest are `new`.
 */
export function factReview(fact: StoryFact, closed: boolean): FactReview {
  if (fact.struck_at !== null) return "struck";
  if (closed) return "corrected";
  if (fact.kept_at !== null || fact.source === "correction") return "kept";
  return "new";
}

export type FactFilter = "new" | "kept" | "struck" | "all";

export const FACT_FILTER_OPTIONS: ReadonlyArray<{ value: FactFilter; label: string }> = [
  { value: "new", label: "New" },
  { value: "kept", label: "Kept" },
  { value: "struck", label: "Struck" },
  { value: "all", label: "All" },
];

/** The chains the Narrator started: a chain whose first fact is the table's. A correction stays with what it overtook. */
function tableChains(facts: readonly StoryFact[]) {
  return factChains(facts).filter((chain) => chain[0]?.fact.source === "table");
}

/** How many facts the table added that the DM has not reviewed: not kept, not struck, not overtaken by a correction. */
export function unreviewedCount(facts: readonly StoryFact[]): number {
  return tableChains(facts)
    .flat()
    .filter((entry) => entry.fact.source === "table" && factReview(entry.fact, entry.closed) === "new").length;
}

/**
 * The record grouped by session for the list, for one filter. A chain is shown whole when any fact in it matches (so a
 * struck-through original keeps the version that overtook it), and `keep` names facts to show whatever the filter says:
 * the ones the DM has just acted on, so a struck line stays on screen long enough to Undo.
 */
export function tableGroups(
  facts: readonly StoryFact[],
  sittings: ReadonlyMap<string, SittingInfo>,
  filter: FactFilter,
  keep: ReadonlySet<string> = new Set(),
): RecordGroup[] {
  const shown = tableChains(facts).filter((chain) =>
    filter === "all" || chain.some((entry) => keep.has(entry.fact.id) || matches(factReview(entry.fact, entry.closed), filter)),
  );
  return groupRecord(shown.flat().map((entry) => entry.fact), sittings);
}

function matches(review: FactReview, filter: Exclude<FactFilter, "all">): boolean {
  // A corrected original is shown beside the version that overtook it, which is `kept`; it is never listed alone.
  return review === filter;
}

/** What Keep writes. Never both stamps: the table refuses a fact that is kept and struck at once. */
export function keepPatch(now: Date = new Date()): { kept_at: string; struck_at: null } {
  return { kept_at: now.toISOString(), struck_at: null };
}

/** What Strike writes: it never happened. A kept fact loses its keep in the same write. */
export function strikePatch(now: Date = new Date()): { struck_at: string; kept_at: null } {
  return { struck_at: now.toISOString(), kept_at: null };
}

/** What Undo writes after a Strike: the fact is as it was before, kept again when it had been kept. */
export function undoStrikePatch(previousKeptAt: string | null): { struck_at: null; kept_at: string | null } {
  return { struck_at: null, kept_at: previousKeptAt };
}

/**
 * The truth Make it a truth files: what the fact says, told to all when the party already knows it, else secret, and
 * remembering the fact it came from so the same fact is not filed twice.
 */
export function truthFromFact(
  fact: Pick<StoryFact, "id" | "body" | "known_to_player">,
): { part: "truth"; knowledge: KnowledgeMark; title: string; from_fact_id: string } {
  return { part: "truth", knowledge: fact.known_to_player ? "all" : "secret", title: fact.body, from_fact_id: fact.id };
}

/** Which truth each fact already became, by fact id: a fact in this map is not offered Make it a truth again. */
export function truthByFact(truths: readonly Pick<CanonEntry, "id" | "from_fact_id">[]): ReadonlyMap<string, string> {
  const byFact = new Map<string, string>();
  for (const truth of truths) if (truth.from_fact_id !== null) byFact.set(truth.from_fact_id, truth.id);
  return byFact;
}

/** The database refused a second truth for one fact (the unique index on `from_fact_id`): two tabs made it at once. */
export function isAlreadyATruth(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "23505";
}
