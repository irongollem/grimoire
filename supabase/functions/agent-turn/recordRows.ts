// The rules behind what the table reads of the campaign's record (`story_facts`), apart from the queries that fetch it.
// `index.ts`'s `loadRecord` asks the database; these decide which facts count and how they are shown.
import { RECORD_SECTION_MAX, type RecordedFact } from "../_shared/agent/record.ts";

/** Beside what is tied to this place and these people, the campaign's newest facts always reach the narrator. */
export const NEWEST_FACTS = 15;

export type FactRow = Record<string, unknown>;

/** The PostgREST `or` filter over `story_fact_links` for this place and these people; null when there is nothing to tie to. */
export function recordTies(about: { locationId: string | null; characterIds: readonly string[] }): string | null {
  const ties: string[] = [];
  if (about.locationId !== null) ties.push(`location_id.eq.${about.locationId}`);
  if (about.characterIds.length > 0) ties.push(`npc_id.in.(${about.characterIds.join(",")})`);
  return ties.length === 0 ? null : ties.join(",");
}

/** The facts worth reading: those tied to the scene and the campaign's newest, each once. */
export function candidateFactIds(linked: readonly FactRow[], newest: readonly FactRow[]): string[] {
  return [...new Set([...linked.map((l) => l.fact_id as string), ...newest.map((f) => f.id as string)])];
}

/** A fact another fact closes (`supersedes_id`) is no longer true and is not shown. */
export function openFacts(facts: readonly FactRow[], closers: readonly FactRow[]): FactRow[] {
  const closed = new Set(closers.map((c) => c.supersedes_id as string));
  return facts.filter((f) => !closed.has(f.id as string));
}

/** The play sessions the open facts were filed in, to ask their numbers of. */
export function sessionIdsOf(open: readonly FactRow[]): string[] {
  return [...new Set(open.map((f) => f.session_id as string | null).filter((id): id is string => id !== null))];
}

/** Session id to session number; a session with no number is left out. */
export function sessionNumbers(rows: readonly FactRow[]): Map<string, number> {
  const numbers = new Map<string, number>();
  for (const s of rows) if (typeof s.number === "number") numbers.set(s.id as string, s.number);
  return numbers;
}

/** The record as the narrator reads it: the newest `RECORD_SECTION_MAX` open facts, oldest first. */
export function recordFrom(open: readonly FactRow[], numbers: ReadonlyMap<string, number>): RecordedFact[] {
  return [...open]
    .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)))
    .slice(-RECORD_SECTION_MAX)
    .map((f) => {
      const number = f.session_id === null ? undefined : numbers.get(f.session_id as string);
      return {
        id: f.id as string,
        body: f.body as string,
        hidden: f.known_to_player !== true,
        when: number === undefined ? null : `Session ${number}`,
      };
    });
}

/** A fact that could not be filed: what the narrator may fix is told apart from what it cannot. */
export function factFailure(closes: string | null, code: string | undefined): string {
  return closes !== null && (code === "23503" || code === "23514")
    ? "The fact to close was not found on this campaign's record, so nothing was filed. Use an id listed under \"On record\"."
    : "The fact could not be put on record. Say what happens without filing it.";
}
