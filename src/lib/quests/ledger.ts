import type {
  QuestBeat,
  QuestConsequence,
  QuestConsequenceAction,
  QuestObjective,
  QuestRouteGate,
  QuestRuntimeChoice,
} from "@/types/quest.types";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "./objectives";

/**
 * The ledger model, as the design canvas states it (`Main` board): *beats are
 * events, objectives are state. A beat raises, achieves, fails or reveals
 * objectives — objectives are the balance and beats are the entries that move
 * it.* Every surface that shows what a beat does to the ledger — a node's chips
 * on the story graph, a branch card's condition in the cockpit, the story-so-far
 * rail — reads it through here, so the four verbs are spelled the same way
 * everywhere and a fifth cannot arrive on one surface and not the others.
 *
 * The database stores the achieve verb as `complete` (`quest_consequences.action`);
 * this module is where that name becomes the design's word. Nothing here writes.
 */
export type LedgerVerb = "raise" | "achieve" | "fail" | "reveal";

export const LEDGER_VERBS: readonly LedgerVerb[] = ["raise", "achieve", "fail", "reveal"];

/** The verb as a sentence subject — "Raises “Save the princess”". */
export const LEDGER_VERB_LABELS: Record<LedgerVerb, string> = {
  raise: "Raises",
  achieve: "Achieves",
  fail: "Fails",
  reveal: "Reveals",
};

/** The one-glyph form a node chip or a spine row carries. */
export const LEDGER_VERB_MARKS: Record<LedgerVerb, string> = {
  raise: "+",
  achieve: "✓",
  fail: "✕",
  reveal: "◉",
};

/** The `quest_consequences.action` a verb is stored as. */
export const LEDGER_VERB_ACTIONS: Record<LedgerVerb, QuestConsequenceAction> = {
  raise: "raise",
  achieve: "complete",
  fail: "fail",
  reveal: "reveal",
};

/** The verb a stored action is, or `null` for a world action. */
export function ledgerVerbOf(action: QuestConsequenceAction): LedgerVerb | null {
  switch (action) {
    case "raise": return "raise";
    case "complete": return "achieve";
    case "fail": return "fail";
    case "reveal": return "reveal";
    case "create_calendar_event":
    case "send_broadcast":
    case "shift_npc_relationship":
    case "unlock_quest":
    case "grant_knowledge":
    case "owe_favor":
    case "award_milestone":
      return null;
    default: {
      const unhandled: never = action;
      return unhandled;
    }
  }
}

/** One entry a beat or a route makes on the ledger. */
export interface LedgerDelta {
  verb: LedgerVerb;
  consequenceId: string;
  objectiveId: string;
  objective: string;
  /** Where the objective stands right now, so a chip can show the verb has
   *  already taken effect. */
  objectiveStatus: QuestObjective["status"];
}

type ObjectiveLookup = ReadonlyMap<string, QuestObjective>;

function objectiveIndex(objectives: readonly QuestObjective[]): ObjectiveLookup {
  return new Map(objectives.map((objective) => [objective.id, objective]));
}

function deltasFrom(
  rows: readonly QuestConsequence[],
  objectives: ObjectiveLookup,
): LedgerDelta[] {
  const deltas: LedgerDelta[] = [];
  for (const row of rows) {
    const verb = ledgerVerbOf(row.action);
    if (!verb || !row.target_objective_id) continue;
    // A rule whose objective has been removed is already gone by FK cascade;
    // if a stale cache still carries one, it says nothing about the ledger.
    const objective = objectives.get(row.target_objective_id);
    if (!objective) continue;
    deltas.push({
      verb,
      consequenceId: row.id,
      objectiveId: objective.id,
      objective: objective.description,
      objectiveStatus: objective.status,
    });
  }
  return deltas;
}

/** What arriving at `beatId` does to the ledger — its `on_beat_id` rules. */
export function beatLedgerDeltas(
  beatId: string,
  consequences: readonly QuestConsequence[],
  objectives: readonly QuestObjective[],
): LedgerDelta[] {
  return deltasFrom(
    consequences.filter((row) => row.on_beat_id === beatId),
    objectiveIndex(objectives),
  );
}

/** What taking the route `edgeId` does to the ledger — its `on_edge_id` rules. */
export function routeLedgerDeltas(
  edgeId: string,
  consequences: readonly QuestConsequence[],
  objectives: readonly QuestObjective[],
): LedgerDelta[] {
  return deltasFrom(
    consequences.filter((row) => row.on_edge_id === edgeId),
    objectiveIndex(objectives),
  );
}

const VERB_PHRASES: Record<LedgerVerb, string> = {
  raise: "raises",
  achieve: "achieves",
  fail: "fails",
  reveal: "reveals",
};

/**
 * A spine row's note — "raised two objectives", "achieved “find who took
 * her”" in the canvas. Names a single objective; counts several under one
 * verb; joins verbs with commas. Empty when the beat moves nothing, which is a
 * fact worth showing as silence rather than as "moves nothing".
 */
export function summarizeLedgerDeltas(deltas: readonly LedgerDelta[]): string {
  if (!deltas.length) return "";
  const byVerb = new Map<LedgerVerb, LedgerDelta[]>();
  for (const delta of deltas) {
    const bucket = byVerb.get(delta.verb);
    if (bucket) bucket.push(delta);
    else byVerb.set(delta.verb, [delta]);
  }
  const parts: string[] = [];
  for (const verb of LEDGER_VERBS) {
    const bucket = byVerb.get(verb);
    if (!bucket) continue;
    parts.push(bucket.length === 1
      ? `${VERB_PHRASES[verb]} “${bucket[0]!.objective}”`
      : `${VERB_PHRASES[verb]} ${bucket.length} objectives`);
  }
  return parts.join(", ");
}

/**
 * How a branch card or an edge label phrases its gate (`Runner` and `Graph`
 * boards): an open route says it is ready and why; a closed one says what it
 * still needs. An ungated route has no condition and gets `null` — most routes
 * are decided at the table, and a fallback would claim otherwise.
 */
export interface RouteCondition {
  text: string;
  open: boolean;
}

export function routeCondition(gate: QuestRouteGate | null | undefined): RouteCondition | null {
  if (!gate) return null;
  const required = QUEST_OBJECTIVE_STATUS_LABELS[gate.required_status].toLowerCase();
  return gate.is_open
    ? { open: true, text: `ready — “${gate.objective}” is ${required}` }
    : { open: false, text: `needs “${gate.objective}” ${required}` };
}

/** How many outgoing routes the ledger has already settled, as the canvas's
 *  fork hint phrases it. */
export function describeForkState(outgoing: readonly QuestRuntimeChoice[]): string {
  if (!outgoing.length) return "";
  const gated = outgoing.filter((choice) => choice.gate);
  if (!gated.length) return "";
  const ready = gated.filter((choice) => choice.gate!.is_open).length;
  if (ready === 0) return "no outcome is settled yet — the ledger decides";
  if (ready === 1) return "one outcome is settled";
  return `${ready} outcomes are settled — your call`;
}

// ── The story so far ────────────────────────────────────────────────────────

export type SpineState = "played" | "current" | "next";

export interface SpineEntry {
  beatId: string;
  title: string;
  state: SpineState;
  /** The row's second line: what the beat did, where it stands, or what
   *  opens it. Empty when there is nothing honest to say. */
  note: string;
  /** For a `next` entry: the route that leads there, and whether its gate
   *  (if any) is open. */
  edgeId?: string;
  open?: boolean;
}

/** The subset of a `path_so_far` row the spine reads. */
export interface SpineTransition {
  to_quest_id?: unknown;
  to_beat_id?: unknown;
  to_beat_title?: unknown;
  thread_id?: unknown;
}

export interface StorySpineInput {
  questId: string;
  beats: readonly Pick<QuestBeat, "id" | "title" | "staged_at_location_id">[];
  /** Oldest first, as `get_quest_runtime_context` returns them. */
  transitions: readonly SpineTransition[];
  currentBeatId: string | null;
  outgoing: readonly QuestRuntimeChoice[];
  consequences: readonly QuestConsequence[];
  objectives: readonly QuestObjective[];
  /** Resolves a staged place to its name; `null` when the place is unknown. */
  placeNameOf?: (locationId: string) => string | null;
  /**
   * Restricts the played rows to this thread (#853) — several threads can
   * share one quest's transition log, and a spine reads as one continuous
   * story only when it is one thread's own history. Omitted, every row still
   * counts, which is what a thread-less (`assert`) row and every caller before
   * threads existed both need.
   */
  threadId?: string;
}

/**
 * The rail the `Runner` board calls "The story so far": every beat the party
 * has played, in the order they played it; the beat they are at; and the
 * beats the routes out of it lead to. Played beats are read from the
 * transition log rather than the visit stack, because Back truncates the
 * stack and the story does not un-happen.
 */
export function storySpine(input: StorySpineInput): SpineEntry[] {
  const beatsById = new Map(input.beats.map((beat) => [beat.id, beat]));
  const entries: SpineEntry[] = [];
  const seen = new Set<string>();

  for (const row of input.transitions) {
    if (row.to_quest_id !== input.questId) continue;
    // A thread filter keeps this thread's own rows plus thread-less asserts —
    // the same rule `path_so_far` is built under server-side. A row with no
    // `thread_id` at all (an older transition, or a caller not passing one)
    // is never excluded by a filter it cannot answer.
    if (input.threadId !== undefined && row.thread_id != null && row.thread_id !== input.threadId) continue;
    const beatId = typeof row.to_beat_id === "string" ? row.to_beat_id : null;
    if (!beatId || beatId === input.currentBeatId || seen.has(beatId)) continue;
    seen.add(beatId);
    const beat = beatsById.get(beatId);
    const title = beat?.title || (typeof row.to_beat_title === "string" ? row.to_beat_title : "") || "Untitled beat";
    entries.push({
      beatId,
      title,
      state: "played",
      note: summarizeLedgerDeltas(beatLedgerDeltas(beatId, input.consequences, input.objectives)),
    });
  }

  if (input.currentBeatId) {
    const beat = beatsById.get(input.currentBeatId);
    const placeName = beat?.staged_at_location_id && input.placeNameOf
      ? input.placeNameOf(beat.staged_at_location_id)
      : null;
    entries.push({
      beatId: input.currentBeatId,
      title: beat?.title || "Untitled beat",
      state: "current",
      note: placeName ?? summarizeLedgerDeltas(beatLedgerDeltas(input.currentBeatId, input.consequences, input.objectives)),
    });
  }

  for (const choice of input.outgoing) {
    const condition = routeCondition(choice.gate);
    entries.push({
      beatId: choice.beat_id,
      title: choice.beat_title || "Untitled beat",
      state: "next",
      note: condition ? (condition.open ? condition.text : `if ${describeGateAsIf(choice.gate!)}`) : "",
      edgeId: choice.edge_id,
      open: condition ? condition.open : true,
    });
  }

  return entries;
}

/** "if “the ledger” is complete" — the canvas's phrasing for a route not yet
 *  opened, read as a future rather than as a lack. */
function describeGateAsIf(gate: QuestRouteGate): string {
  return `“${gate.objective}” is ${QUEST_OBJECTIVE_STATUS_LABELS[gate.required_status].toLowerCase()}`;
}
