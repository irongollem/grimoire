import { getReachableBeatIds, rootBeatIds } from "./graph";
import type {
  QuestBeat,
  QuestBeatEdge,
  QuestBeatEdgeGate,
  QuestConsequence,
  QuestConsequenceAction,
  QuestConsequenceObjectiveStatus,
  QuestObjective,
} from "@/types/quest.types";

/**
 * Quest-wide consistency checks that need no model (#832, out of #821).
 *
 * Epic #780 gave quests real invariants — a computed graph root, an objective
 * ledger with a four-state life, consequences as rules, routes gated on that
 * ledger. Most of the ways those can be wrong are **graph questions**, and a
 * graph question answered by a language model is arithmetic bought at a premium
 * and returned less reliably. So these are pure functions, and the AI passes
 * #821 contemplates start where judgement genuinely begins.
 *
 * Why it matters that this lands first: production says the DM writes prose and
 * wires almost nothing — 68 beats against 13 forward transitions, 5 of 44 routes
 * with a condition. The tempting conclusion is "they need AI to do the wiring".
 * But a check that reports nothing is wired is not the same tool as one that
 * wires it, and running these over real quests is what tells us which is wanted.
 *
 * This module computes. It does not render, does not fetch, and does not decide
 * where a finding is shown.
 */

export type QuestConsistencyKind =
  | "unreachable_beat"
  | "objective_never_raised"
  | "gate_never_opens"
  | "consequence_cycle"
  | "objective_never_resolves";

export interface QuestConsistencyFinding {
  kind: QuestConsistencyKind;
  /** One DM-facing sentence. Says what is wrong, not what to do about it. */
  message: string;
  beatIds?: string[];
  objectiveIds?: string[];
  edgeId?: string;
  /**
   * True but not necessarily a mistake. Hand assertion is a supported way to
   * move the ledger (#796 exists for exactly that), so "nothing automates this"
   * is information rather than a defect — a surface may reasonably hide these
   * by default.
   */
  advisory?: boolean;
}

/**
 * Field subsets rather than whole rows, the same convention `graph.ts` uses.
 * It keeps the module honest about what it actually reads — and a caller can
 * hand it a projection without first constructing rows it does not need.
 */
type CheckedBeat = Pick<QuestBeat, "id" | "title" | "kind" | "is_improvised">;
type CheckedEdge = Pick<QuestBeatEdge, "source_beat_id" | "target_beat_id">;
type CheckedObjective = Pick<QuestObjective, "id" | "description" | "status">;
type CheckedConsequence = Pick<QuestConsequence, "action" | "on_objective_id" | "target_objective_id">;
type CheckedGate = Pick<QuestBeatEdgeGate, "edge_id" | "objective_id" | "status">;

export interface QuestConsistencyInput {
  beats: readonly CheckedBeat[];
  edges: readonly CheckedEdge[];
  objectives: readonly CheckedObjective[];
  consequences: readonly CheckedConsequence[];
  gates: readonly CheckedGate[];
}

/**
 * The status a ledger verb leaves its target in.
 *
 * `reveal` maps to `pending` alongside `raise` because revealing implies
 * raising — a constraint the database enforces (`quest_objectives_dormant_is_hidden`
 * makes dormant-and-visible unstorable), and one this epic learned by shipping
 * the opposite and getting a 23514 mid-transition.
 */
const ACTION_RESULT: Partial<Record<QuestConsequenceAction, QuestConsequenceObjectiveStatus>> = {
  raise: "pending",
  reveal: "pending",
  complete: "complete",
  fail: "failed",
};

function isLive(beat: CheckedBeat): boolean {
  return beat.kind !== "archived" && !beat.is_improvised;
}

function shortTitle(title: string): string {
  const trimmed = title.trim();
  return trimmed.length > 60 ? `${trimmed.slice(0, 57)}…` : trimmed;
}

/** Beats a party walking the authored story can actually arrive at. */
function reachableBeatIds(input: QuestConsistencyInput): Set<string> {
  const roots = rootBeatIds(input.beats, [...input.edges]);
  const reached = new Set(roots);
  for (const root of roots) {
    for (const id of getReachableBeatIds(root, [...input.edges])) reached.add(id);
  }
  return reached;
}

/**
 * A live beat with no path from any root.
 *
 * Not the same as the per-beat `isDisconnected` gap in `presentation.ts`, which
 * asks whether a beat has any edges at all. A chain of three beats hanging off
 * nothing satisfies that check and is still unreachable — every beat in it has
 * an edge, just never one that traces back to an opening.
 */
function unreachableBeats(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const reached = reachableBeatIds(input);
  return input.beats
    .filter((beat) => isLive(beat) && !reached.has(beat.id))
    .map((beat) => ({
      kind: "unreachable_beat" as const,
      message: `"${shortTitle(beat.title)}" cannot be reached from the opening — no route leads to it.`,
      beatIds: [beat.id],
    }));
}

/** Every status any consequence can put a given objective into. */
function producibleStatuses(consequences: readonly CheckedConsequence[]): Map<string, Set<QuestConsequenceObjectiveStatus>> {
  const byObjective = new Map<string, Set<QuestConsequenceObjectiveStatus>>();
  for (const rule of consequences) {
    const result = ACTION_RESULT[rule.action];
    if (!result || !rule.target_objective_id) continue;
    const statuses = byObjective.get(rule.target_objective_id) ?? new Set<QuestConsequenceObjectiveStatus>();
    statuses.add(result);
    byObjective.set(rule.target_objective_id, statuses);
  }
  return byObjective;
}

/**
 * A dormant objective no rule can ever raise.
 *
 * `dormant` means "a branch nobody has taken *yet*". If nothing can take it,
 * the objective is not waiting — it is dead, and it will never appear to the
 * players, because dormant rows cannot be player-visible.
 */
function objectivesNeverRaised(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const producible = producibleStatuses(input.consequences);
  return input.objectives
    .filter((objective) => objective.status === "dormant" && !producible.get(objective.id)?.has("pending"))
    .map((objective) => ({
      kind: "objective_never_raised" as const,
      message: `"${shortTitle(objective.description)}" is dormant and nothing raises it — no beat will ever put it in front of the party.`,
      objectiveIds: [objective.id],
    }));
}

/**
 * A route gated on a state nothing can produce.
 *
 * The nastiest of these checks, because the gate looks right on the canvas: a
 * fork with a condition on it, drawn and saved. It is simply shut forever.
 */
function gatesThatNeverOpen(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const producible = producibleStatuses(input.consequences);
  const objectiveById = new Map(input.objectives.map((objective) => [objective.id, objective]));

  return input.gates.flatMap((gate) => {
    const objective = objectiveById.get(gate.objective_id);
    // An unknown objective is a referential problem, not a reachability one —
    // the database's foreign key owns that, so stay quiet rather than guess.
    if (!objective) return [];
    if (objective.status === gate.status) return [];
    if (producible.get(gate.objective_id)?.has(gate.status)) return [];
    return [{
      kind: "gate_never_opens" as const,
      message: `A route waits for "${shortTitle(objective.description)}" to be ${gate.status}, and nothing ever sets it — that branch can never be taken.`,
      objectiveIds: [objective.id],
      edgeId: gate.edge_id,
    }];
  });
}

/**
 * A cycle among objective-conditioned rules.
 *
 * `private.apply_quest_consequences` bounds itself at 8 rounds, so a cycle
 * degrades rather than hangs — but it degrades **at the table**, silently, in
 * the middle of a session. Prep is a better place to learn about it.
 *
 * Only objective→objective edges form a cycle here: a rule fired by a beat or
 * an edge is triggered by the party arriving somewhere, which the engine cannot
 * re-enter on its own.
 */
function consequenceCycles(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const outgoing = new Map<string, string[]>();
  for (const rule of input.consequences) {
    if (!rule.on_objective_id || !rule.target_objective_id) continue;
    if (!ACTION_RESULT[rule.action]) continue;
    const targets = outgoing.get(rule.on_objective_id) ?? [];
    targets.push(rule.target_objective_id);
    outgoing.set(rule.on_objective_id, targets);
  }

  const objectiveById = new Map(input.objectives.map((objective) => [objective.id, objective]));
  const findings: QuestConsistencyFinding[] = [];
  const settled = new Set<string>();
  const onPath = new Set<string>();
  const reported = new Set<string>();

  function walk(id: string, path: string[]): void {
    if (onPath.has(id)) {
      const cycle = path.slice(path.indexOf(id));
      // One finding per cycle, keyed on its members, so a three-objective loop
      // reports once rather than once per entry point.
      const key = [...cycle].sort().join("|");
      if (!reported.has(key)) {
        reported.add(key);
        const names = cycle.map((memberId) => shortTitle(objectiveById.get(memberId)?.description ?? "an objective"));
        findings.push({
          kind: "consequence_cycle",
          message: `These objectives trigger each other in a loop: ${names.join(" → ")} → ${names[0]}. The engine stops after 8 rounds, mid-session.`,
          objectiveIds: cycle,
        });
      }
      return;
    }
    if (settled.has(id)) return;
    onPath.add(id);
    for (const next of outgoing.get(id) ?? []) walk(next, [...path, id]);
    onPath.delete(id);
    settled.add(id);
  }

  for (const id of outgoing.keys()) walk(id, []);
  return findings;
}

/**
 * A live objective nothing can complete or fail.
 *
 * Advisory on purpose: moving an objective by hand is supported and sometimes
 * right — #796 built `assert_quest_objective_status` for exactly that. This
 * says "the machine will never move this", which is worth knowing and is not by
 * itself a mistake.
 */
function objectivesNeverResolved(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const producible = producibleStatuses(input.consequences);
  return input.objectives
    .filter((objective) => {
      if (objective.status === "complete" || objective.status === "failed") return false;
      const statuses = producible.get(objective.id);
      return !statuses?.has("complete") && !statuses?.has("failed");
    })
    .map((objective) => ({
      kind: "objective_never_resolves" as const,
      message: `Nothing completes or fails "${shortTitle(objective.description)}" — it can only be ticked by hand.`,
      objectiveIds: [objective.id],
      advisory: true,
    }));
}

/**
 * Every consistency finding for one quest, most structural first.
 *
 * Order is deliberate: an unreachable beat invalidates whatever hangs off it,
 * so a DM reading top-down fixes the cause before the symptoms.
 */
export function deriveQuestConsistency(input: QuestConsistencyInput): QuestConsistencyFinding[] {
  const structural = [
    ...unreachableBeats(input),
    ...consequenceCycles(input),
    ...gatesThatNeverOpen(input),
    ...objectivesNeverRaised(input),
  ];

  // Report the cause, not the cause and then its symptom. An objective nothing
  // raises is necessarily also an objective nothing resolves, so printing both
  // says one problem twice under two names — and the second, weaker line makes
  // the first easier to miss. Found by looking at the rendered panel rather
  // than by a test: on screen, two lines about one objective read as two
  // separate faults.
  const alreadyReported = new Set(structural.flatMap((finding) => finding.objectiveIds ?? []));

  return [
    ...structural,
    ...objectivesNeverResolved(input).filter(
      (finding) => !finding.objectiveIds?.some((id) => alreadyReported.has(id)),
    ),
  ];
}
