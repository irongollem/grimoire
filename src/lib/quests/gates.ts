import { QUEST_OBJECTIVE_STATUSES, QUEST_OBJECTIVE_STATUS_LABELS } from "@/lib/quests/objectives";
import type {
  QuestBeatEdge,
  QuestBeatEdgeGate,
  QuestConsequenceAction,
  QuestGateMode,
  QuestObjective,
  QuestObjectiveStatus,
  QuestRouteEffect,
  QuestRouteGate,
  QuestRouteGateCondition,
} from "@/types/quest.types";

/** The status words a gate sentence uses: the same labels the gate editor's
 *  checkboxes show (`QUEST_OBJECTIVE_STATUS_LABELS`), lowercased mid-sentence,
 *  so "needs X open or completed" reads in the words the DM ticked. */
const GATE_STATUS_WORDS = Object.fromEntries(
  QUEST_OBJECTIVE_STATUSES.map((status) => [status, QUEST_OBJECTIVE_STATUS_LABELS[status].toLowerCase()]),
) as Record<QuestObjectiveStatus, string>;

/** "open or completed" / "not yet raised, open or completed" - the set a
 *  condition accepts, in ladder order whatever order it was stored in. */
export function describeGateStatuses(statuses: readonly QuestObjectiveStatus[]): string {
  const order: QuestObjectiveStatus[] = ["dormant", "pending", "complete", "failed"];
  const words = order.filter((status) => statuses.includes(status)).map((status) => GATE_STATUS_WORDS[status]);
  if (words.length <= 1) return words[0] ?? "";
  return `${words.slice(0, -1).join(", ")} or ${words[words.length - 1]}`;
}

function conditionPhrase(condition: QuestRouteGateCondition): string {
  return `“${condition.objective}” ${describeGateStatuses(condition.statuses)}`;
}

function joinConditions(phrases: string[], mode: QuestGateMode): string {
  return phrases.join(mode === "any" ? " or " : " and ");
}

/**
 * Joins each route's authored gate rows against the objectives they name, so
 * Build mode can say whether a route is open without a round trip to the
 * runtime RPC. Mirrors `private.edge_gate_state`, which computes the same
 * `QuestRouteGate` server-side for Run mode (#1011): `all` is open when every
 * condition holds, `any` when one does.
 *
 * A condition whose objective has since been removed is skipped rather than
 * surfaced as a dangling reference; the FK cascade has already dropped the
 * row by the time either query settles. A route left with no conditions has
 * no gate at all.
 */
export function deriveQuestRouteGates(
  gates: QuestBeatEdgeGate[],
  objectives: QuestObjective[],
  edges: readonly Pick<QuestBeatEdge, "id" | "gate_mode">[],
): Record<string, QuestRouteGate> {
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const modeByEdge = new Map(edges.map((edge) => [edge.id, edge.gate_mode]));
  const conditionsByEdge = new Map<string, QuestRouteGateCondition[]>();
  for (const gate of gates) {
    const objective = objectiveById.get(gate.objective_id);
    if (!objective) continue;
    const list = conditionsByEdge.get(gate.edge_id) ?? [];
    list.push({
      objective_id: gate.objective_id,
      objective: objective.description,
      statuses: gate.statuses,
      current_status: objective.status,
      met: gate.statuses.includes(objective.status),
    });
    conditionsByEdge.set(gate.edge_id, list);
  }
  const result: Record<string, QuestRouteGate> = {};
  for (const [edgeId, conditions] of conditionsByEdge) {
    result[edgeId] = buildRouteGate(modeByEdge.get(edgeId) ?? "all", conditions);
  }
  return result;
}

/** `all` is open when every condition holds, `any` when one does. */
function buildRouteGate(mode: QuestGateMode, conditions: QuestRouteGateCondition[]): QuestRouteGate {
  return {
    mode,
    conditions,
    is_open: mode === "any" ? conditions.some((condition) => condition.met) : conditions.every((condition) => condition.met),
  };
}

/** A condition as the route editor holds it before it is saved. `gateId` is
 *  the stored row's id, or null for one not yet written. */
export interface GateConditionDraft {
  key: string;
  gateId: string | null;
  objectiveId: string;
  statuses: QuestObjectiveStatus[];
}

/** A route may accept at most three of the four statuses: all four would be
 *  no condition at all (`quest_beat_edge_gates` refuses it). */
export const GATE_MAX_STATUSES = 3;

/** The editor's drafts as the gate they would make, so its summary line and
 *  the canvas pill read the same words before and after saving. Null with no
 *  complete condition. */
export function draftRouteGate(
  drafts: readonly GateConditionDraft[],
  mode: QuestGateMode,
  objectives: readonly Pick<QuestObjective, "id" | "description" | "status">[],
): QuestRouteGate | null {
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const conditions: QuestRouteGateCondition[] = [];
  for (const draft of drafts) {
    const objective = objectiveById.get(draft.objectiveId);
    if (!objective || !draft.statuses.length) continue;
    conditions.push({
      objective_id: objective.id,
      objective: objective.description,
      statuses: draft.statuses,
      current_status: objective.status,
      met: draft.statuses.includes(objective.status),
    });
  }
  return conditions.length ? buildRouteGate(mode, conditions) : null;
}

/** The first thing wrong with the drafts, in the DM's words, or null. */
export function validateGateDrafts(drafts: readonly GateConditionDraft[]): string | null {
  if (drafts.some((draft) => !draft.objectiveId)) return "Choose an objective for each condition, or remove it.";
  if (drafts.some((draft) => !draft.statuses.length)) return "Tick at least one status for each condition.";
  if (drafts.some((draft) => draft.statuses.length > GATE_MAX_STATUSES)) return "A condition can accept at most three of the four statuses.";
  if (new Set(drafts.map((draft) => draft.objectiveId)).size !== drafts.length) return "An objective can be a condition only once per route.";
  return null;
}

/** One line per condition for a tooltip: `“A” complete (now pending)`, led by
 *  how they combine when there are several. */
export function describeQuestRouteGateLines(gate: QuestRouteGate): string[] {
  const lines = gate.conditions.map(
    (condition) => `${condition.met ? "✓" : "✕"} “${condition.objective}” ${describeGateStatuses(condition.statuses)} (now ${GATE_STATUS_WORDS[condition.current_status]})`,
  );
  if (gate.conditions.length < 2) return [describeQuestRouteGate(gate)];
  return [`${gate.is_open ? "Open" : "Closed"}: ${gate.mode === "all" ? "all" : "any"} of these`, ...lines];
}

/** Short pill text for the Build-mode canvas: the single condition itself, or
 *  a count and how they combine. Openness is carried separately on
 *  `gate.is_open` so the caller decides how to style it. */
export function questRouteGateLabel(gate: QuestRouteGate): string {
  const [only] = gate.conditions;
  if (gate.conditions.length === 1 && only) return `${only.objective} · ${describeGateStatuses(only.statuses)}`;
  return `${gate.conditions.length} conditions · ${gate.mode}`;
}

/** What a route needs, as a clause: `needs “A” complete and “B” failed`. Run
 *  mode's branch card and the Build editor's summary line both start here. */
export function describeQuestRouteNeeds(gate: QuestRouteGate): string {
  return `needs ${joinConditions(gate.conditions.map(conditionPhrase), gate.mode)}`;
}

/** What holds on an open route: `“A” is complete and “B” is failed`. For an
 *  `any` gate only the conditions that are met are named. */
export function describeQuestRouteHeld(gate: QuestRouteGate): string {
  const held = gate.mode === "any" ? gate.conditions.filter((condition) => condition.met) : gate.conditions;
  return joinConditions(held.map((condition) => `“${condition.objective}” is ${GATE_STATUS_WORDS[condition.current_status]}`), gate.mode);
}

/** The sentence a branch card or the route editor shows, open or shut: the
 *  reason has to be visible on a closed route, not just the fact that it is
 *  closed. */
export function describeQuestRouteGate(gate: QuestRouteGate): string {
  if (gate.is_open) return `Open: ${describeQuestRouteHeld(gate)}`;
  const current = gate.conditions
    .filter((condition) => !condition.met)
    .map((condition) => `“${condition.objective}” is ${GATE_STATUS_WORDS[condition.current_status]}`);
  return `Closed: ${describeQuestRouteNeeds(gate)}; ${current.join(", ")}`;
}

const EFFECT_VERBS: Record<QuestConsequenceAction, string> = {
  raise: "raises",
  reveal: "reveals",
  complete: "completes",
  fail: "fails",
  create_calendar_event: "schedules a calendar event",
  send_broadcast: "sends a broadcast",
  // Signed, so the verb cannot say which way. `describeQuestRouteEffect`
  // appends the objective's name and has no step to read — the branch card
  // says that a disposition moves; the rule editor says by how much.
  shift_npc_relationship: "shifts an NPC's disposition",
  unlock_quest: "unlocks a quest",
  grant_knowledge: "grants knowledge",
  owe_favor: "owes a favor",
  award_milestone: "awards a milestone",
  give_handout: "gives a handout",
  tick_clock: "ticks",
  move_npc: "moves",
  add_companion: "joins the party",
  shift_faction_standing: "shifts standing",
};

/** What a branch card shows for one line of "taking this route also does
 *  this" — read from `quest_consequences.on_edge_id` (#794), never authored
 *  on the edge itself. */
export function describeQuestRouteEffect(effect: QuestRouteEffect): string {
  const verb = EFFECT_VERBS[effect.action];
  const subject = effect.objective ? ` “${effect.objective}”` : "";
  const delay = effect.after_days > 0 ? ` in ${effect.after_days}d` : "";
  return `Then ${verb}${subject}${delay}`;
}
