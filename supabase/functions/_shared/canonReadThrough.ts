/**
 * "Read it through" (#1255 item 7): one pass over the whole canon that lists what does not hold together, and writes
 * nothing. Two kinds of finding, from two different sources on purpose:
 *
 *  - a LOOSE END is arithmetic over rows (a secret with no clue, a force with nothing left to do, a question nothing is
 *    tied to), so it is computed here in code and never asked of the model, which would guess;
 *  - a CONTRADICTION needs reading, so the model proposes them and this file refuses any that names an entry the
 *    campaign does not have (the ids offered to the model come from a campaign-scoped read, so an id outside that set
 *    is invented or from elsewhere).
 *
 * Pure (no Deno-only imports), so the browser imports it as `@edge-shared/canonReadThrough.ts` for the finding type.
 */
import type { CanonSetAside } from "./canonSuggestions.ts";

export const FINDING_KINDS = ["contradiction", "loose_end"] as const;
export type FindingKind = (typeof FINDING_KINDS)[number];

export interface ReadFinding {
  kind: FindingKind;
  text: string;
  /** The entries it is about, as `canon_entries` ids; the client links each to `/canon?entry=<id>`. */
  entry_ids: string[];
}

export const MAX_CONTRADICTIONS = 8;
const MAX_FINDING_CHARS = 400;
const MAX_FINDING_ENTRIES = 4;

/** What the loose-end rules read of an entry. */
export interface ReadEntry {
  id: string;
  part: string;
  title: string;
  revealed_at: string | null;
  closed_as: string | null;
}

export interface LooseEndInput {
  entries: readonly ReadEntry[];
  /** `secret_id` of every clue in the campaign. */
  clueSecretIds: readonly string[];
  /** Every step of every force, with whether the force has reached it. */
  steps: readonly { force_id: string; reached_at: string | null }[];
  /** Every quest tie of an entry (`canon_entry_quests`). */
  entryQuests: readonly { entry_id: string }[];
}

const named = (title: string): string => (title.trim() === "" ? "An untitled entry" : `“${title.trim()}”`);

/**
 * The loose ends of a canon, in the order the DM keeps it:
 *  - an unrevealed secret with no clue (a revealed one has done its job);
 *  - an open force with no step it has not reached (none written, or all reached), so nothing is left for it to do;
 *  - an open question no quest is tied to, so nothing in play points at it.
 * A closed force or question is finished and is never a loose end.
 */
export function looseEnds({ entries, clueSecretIds, steps, entryQuests }: LooseEndInput): ReadFinding[] {
  const clued = new Set(clueSecretIds);
  const moving = new Set(steps.filter((s) => s.reached_at === null).map((s) => s.force_id));
  const tied = new Set(entryQuests.map((q) => q.entry_id));
  const out: ReadFinding[] = [];
  for (const e of entries) {
    if (e.part === "secret" && e.revealed_at === null && !clued.has(e.id)) {
      out.push({ kind: "loose_end", text: `${named(e.title)} is a secret with no clue, so the party has nothing to find.`, entry_ids: [e.id] });
    } else if (e.part === "force" && e.closed_as === null && !moving.has(e.id)) {
      out.push({ kind: "loose_end", text: `${named(e.title)} is a force with no next step, so nothing is left for it to do.`, entry_ids: [e.id] });
    } else if (e.part === "question" && e.closed_as === null && !tied.has(e.id)) {
      out.push({ kind: "loose_end", text: `${named(e.title)} is an open question no quest is tied to, so nothing in play points at it.`, entry_ids: [e.id] });
    }
  }
  return out;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * The model's contradictions, kept only when every entry they name is one of the campaign's (`knownIds`, read with the
 * campaign in the query) and at least two distinct ones are named: a contradiction is between entries. A finding that
 * names anything else is set aside whole, so one invented id cannot lend a made-up claim the look of a real one.
 */
export function sanitizeContradictions(
  parsed: unknown,
  knownIds: ReadonlySet<string>,
): { findings: ReadFinding[]; setAside: CanonSetAside[] } {
  const findings: ReadFinding[] = [];
  const setAside: CanonSetAside[] = [];
  const list = isRecord(parsed) && Array.isArray(parsed.contradictions) ? parsed.contradictions : [];
  for (const raw of list) {
    if (findings.length >= MAX_CONTRADICTIONS) break;
    if (!isRecord(raw) || typeof raw.text !== "string") continue;
    const text = raw.text.trim().replace(/\s+/g, " ").slice(0, MAX_FINDING_CHARS).trimEnd();
    if (text === "") continue;
    const ids = [...new Set((Array.isArray(raw.entry_ids) ? raw.entry_ids : []).filter((i): i is string => typeof i === "string"))];
    if (ids.some((id) => !knownIds.has(id))) {
      setAside.push({ claim: text, reason: "it named an entry this campaign does not have" });
      continue;
    }
    if (ids.length < 2) continue;
    findings.push({ kind: "contradiction", text, entry_ids: ids.slice(0, MAX_FINDING_ENTRIES) });
  }
  return { findings, setAside };
}

export function readShape(): string {
  return `\n\nReturn a single JSON object {"contradictions":[{"text":"what cannot both be true, one or two sentences","entry_ids":["the ids of the entries that disagree, copied exactly from the list given"]}]}. Up to ${MAX_CONTRADICTIONS} contradictions, each naming at least two entries. Report only a real contradiction between what two entries say; do not report a missing clue, a missing step or an open question, which are checked elsewhere. If nothing contradicts, return {"contradictions":[]}.\n` +
    "Return only the JSON object. No markdown fences, no explanation.";
}
