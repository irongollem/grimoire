/**
 * "Read it through" (#1255 item 7): one pass over the whole canon that lists what does not hold together, and writes
 * nothing. Two kinds of finding, from two different sources on purpose:
 *
 *  - a LOOSE END is arithmetic over rows (see `canonLooseEnds.ts`, the one rule Tonight shares), so it is computed in
 *    code and never asked of the model, which would guess;
 *  - a CONTRADICTION needs reading, so the model proposes them and this file refuses any that names an entry the
 *    campaign does not have (the ids offered to the model come from a campaign-scoped read, so an id outside that set
 *    is invented or from elsewhere).
 *
 * Pure (no Deno-only imports), so the browser imports it as `@edge-shared/canonReadThrough.ts` for the finding type.
 */
import { looseEnds, type LooseEndKind, type LooseEndsInput } from "./canonLooseEnds.ts";
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

const named = (title: string): string => (title.trim() === "" ? "An untitled entry" : `“${title.trim()}”`);

const KIND_NOUN: Record<LooseEndKind, string> = { secret: "secret", force: "force", question: "question", backstory: "backstory", arc: "arc" };

/**
 * The loose ends of a canon as findings. WHAT is a loose end is decided by `canonLooseEnds.ts`, the one rule Tonight
 * uses too; this only words each for the read. An arc is not an entry, so its finding names none.
 */
export function looseEndFindings(input: LooseEndsInput): ReadFinding[] {
  return looseEnds(input).map((end) => ({
    kind: "loose_end",
    text: `${named(end.title)} (${KIND_NOUN[end.kind]}): ${end.reasons.join("; ")}.`,
    entry_ids: end.kind === "arc" ? [] : [end.subjectId],
  }));
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
