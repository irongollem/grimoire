import type { QuestObjectiveResult, QuestSpineBeatResult, QuestSpineRouteResult } from "@/ai/types";
import { QUEST_BEAT_KINDS, type QuestBeatKind, type QuestObjectiveStatus } from "@/types/quest.types";

/**
 * Turns the AI quest generator's `beats`/`routes`/`objectives` (#822) into
 * the writes `useCreateQuestFromHook` needs to make: a beat per spine entry,
 * a route edge per pair, a `raise` consequence per objective a beat names,
 * and the per-objective `pending`/`dormant` split that is the actual point of
 * the story — see `deriveObjectiveStatuses` below.
 *
 * Everything here is pure and works on the model's own string `key`s, never
 * on database ids: resolving a key to a real uuid only happens after the
 * caller has actually inserted that row, which these plan functions know
 * nothing about. The response is untrusted — the model can omit `beats`
 * entirely, invent dangling or duplicate keys, leave an objective's
 * `raised_by` pointing at nothing, or write a `kind` that isn't one of the
 * five the schema accepts, and a JSON response is never actually checked
 * against these interfaces at runtime — so every function below degrades
 * (drops the offending entry, or returns nothing) rather than throwing. A
 * malformed or partial response must never block the plain
 * quest-and-objectives write path underneath it, and — per #822 — nothing
 * here manufactures a beat to paper over one the model didn't provide.
 */

/** A sanity ceiling, not a design constraint: the prompt asks for 3-5 beats,
 *  but a degenerate response should not turn into dozens of sequential beat
 *  inserts. */
const SPINE_BEAT_SANITY_CAP = 8;

export interface SpineBeatDraft {
  /** The model's own local id — used only to join routes/objectives to this
   *  beat below, never persisted. */
  key: string;
  title: string;
  kind: QuestBeatKind;
  /** Plain text; the caller converts to Tiptap JSON before writing. */
  dmContentPlain: string;
}

export interface SpineRoutePlanEntry {
  from: string;
  to: string;
}

export interface SpineConsequencePlanEntry {
  beatKey: string;
  objectiveIndex: number;
}

/** A JSON response can put anything under a field the interface calls
 *  `string` — this is what "untrusted" means for a value that only passed
 *  through `JSON.parse` and a type assertion, never a runtime check. Used
 *  everywhere below instead of trusting the declared type. */
function asTrimmedString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function normalizeSpineBeatKind(kind: unknown): QuestBeatKind {
  const candidate = asTrimmedString(kind);
  return (QUEST_BEAT_KINDS as readonly string[]).includes(candidate) ? (candidate as QuestBeatKind) : "neutral";
}

/**
 * Valid, deduplicated beat drafts in the order the model wrote them. The
 * first surviving entry is the root beat every other function below treats
 * as the opening of the story — a beat with a blank key or title cannot be
 * created, so it (and anything that only refers to it) is dropped here
 * rather than at each downstream call site. An absent or empty `beats` is
 * not an error: it means the response had no usable spine, which
 * useCreateQuestFromHook handles by creating no beat at all.
 */
export function planSpineBeats(beats: QuestSpineBeatResult[] | undefined): SpineBeatDraft[] {
  if (!Array.isArray(beats)) return [];
  const seenKeys = new Set<string>();
  const drafts: SpineBeatDraft[] = [];
  for (const beat of beats) {
    if (drafts.length >= SPINE_BEAT_SANITY_CAP) break;
    const key = asTrimmedString(beat?.key);
    const title = asTrimmedString(beat?.title);
    if (!key || !title || seenKeys.has(key)) continue;
    seenKeys.add(key);
    drafts.push({
      key,
      title,
      kind: normalizeSpineBeatKind(beat.kind),
      dmContentPlain: typeof beat.dm_content === "string" ? beat.dm_content : "",
    });
  }
  return drafts;
}

/**
 * Routes between beats that actually survived {@link planSpineBeats}, with
 * self-loops and duplicate pairs dropped — the same shape
 * `isDuplicateQuestEdge` (mutations.ts) guards against for hand-authored
 * routes. Takes the already-planned beats rather than the raw response so
 * callers that need both don't plan the beats twice.
 */
export function planSpineRoutes(beats: SpineBeatDraft[], routes: QuestSpineRouteResult[] | undefined): SpineRoutePlanEntry[] {
  if (!Array.isArray(routes) || beats.length === 0) return [];
  const beatKeys = new Set(beats.map((b) => b.key));
  const seen = new Set<string>();
  const planned: SpineRoutePlanEntry[] = [];
  for (const route of routes) {
    const from = asTrimmedString(route?.from);
    const to = asTrimmedString(route?.to);
    if (!from || !to || from === to) continue;
    if (!beatKeys.has(from) || !beatKeys.has(to)) continue;
    const dedupeKey = `${from}->${to}`;
    if (seen.has(dedupeKey)) continue;
    seen.add(dedupeKey);
    planned.push({ from, to });
  }
  return planned;
}

/**
 * Per-objective-index status (#822 — this is the point of the story): an
 * objective whose `raised_by` names the root beat (the first entry in
 * {@link planSpineBeats}'s output) lands `pending`; one whose `raised_by`
 * names a later beat lands `dormant`, because the party hasn't been sent
 * down that branch yet; one left unwired — absent, blank, or naming a beat
 * the hook never declared — lands `pending` too, conservatively, so a hole
 * in the model's output never hides an objective from the DM. No beats at
 * all (an absent or empty spine) means every objective is `pending`: there
 * is nothing to raise it out of dormant in the first place.
 */
export function deriveObjectiveStatuses(
  objectives: QuestObjectiveResult[] | undefined,
  beats: SpineBeatDraft[],
): QuestObjectiveStatus[] {
  const list = Array.isArray(objectives) ? objectives : [];
  if (beats.length === 0) {
    return list.map(() => "pending");
  }
  const rootKey = beats[0]!.key;
  const beatKeys = new Set(beats.map((b) => b.key));
  return list.map((objective) => {
    const raisedBy = asTrimmedString(objective?.raised_by);
    if (!raisedBy || !beatKeys.has(raisedBy)) return "pending";
    return raisedBy === rootKey ? "pending" : "dormant";
  });
}

/**
 * One entry per objective whose `raised_by` names a beat that actually
 * survived {@link planSpineBeats}. This is the plan for the
 * `quest_consequences` rows #822 adds: once the beat and the objective both
 * have real ids, each entry becomes one
 * `{ on_beat_id, action: 'raise', target_objective_id }` row — including for
 * a root-raised (`pending`) objective, so arriving at the opening beat is
 * still a logged event, not just an initial value nothing ever set.
 */
export function planObjectiveConsequences(
  objectives: QuestObjectiveResult[] | undefined,
  beats: SpineBeatDraft[],
): SpineConsequencePlanEntry[] {
  const list = Array.isArray(objectives) ? objectives : [];
  if (list.length === 0 || beats.length === 0) return [];
  const beatKeys = new Set(beats.map((b) => b.key));
  const entries: SpineConsequencePlanEntry[] = [];
  list.forEach((objective, objectiveIndex) => {
    const raisedBy = asTrimmedString(objective?.raised_by);
    if (raisedBy && beatKeys.has(raisedBy)) entries.push({ beatKey: raisedBy, objectiveIndex });
  });
  return entries;
}

/**
 * Beat order rendered as "1 → 2" pairs, numbered by position in
 * {@link planSpineBeats}'s output — the compact preview #822 asks for
 * ("this is a preview, not a graph editor"), not a rendering of the graph
 * itself.
 */
export function describeSpineRoutes(beats: SpineBeatDraft[], routes: QuestSpineRouteResult[] | undefined): string[] {
  const position = new Map(beats.map((b, i) => [b.key, i + 1]));
  const described: string[] = [];
  for (const route of planSpineRoutes(beats, routes)) {
    const from = position.get(route.from);
    const to = position.get(route.to);
    if (from !== undefined && to !== undefined) described.push(`${from} → ${to}`);
  }
  return described;
}
