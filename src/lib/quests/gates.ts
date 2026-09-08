import type {
  QuestBeatEdgeGate,
  QuestConsequenceAction,
  QuestObjective,
  QuestRouteEffect,
  QuestRouteGate,
} from "@/types/quest.types";
import { QUEST_OBJECTIVE_STATUS_LABELS } from "./objectives";

/**
 * Joins each authored gate against the objective it names, so Build mode can
 * say whether a route is open without a round trip to the runtime RPC. Mirrors
 * the shape `get_quest_runtime_context` computes server-side for Run mode
 * (#795), so both surfaces read the same fields off `QuestRouteGate`.
 *
 * A gate whose objective has since been removed is silently skipped rather
 * than surfaced as a dangling reference — the FK cascade means that row is
 * already gone from `gates` too by the time either query settles.
 */
export function deriveQuestRouteGates(
  gates: QuestBeatEdgeGate[],
  objectives: QuestObjective[],
): Record<string, QuestRouteGate> {
  const objectiveById = new Map(objectives.map((objective) => [objective.id, objective]));
  const result: Record<string, QuestRouteGate> = {};
  for (const gate of gates) {
    const objective = objectiveById.get(gate.objective_id);
    if (!objective) continue;
    result[gate.edge_id] = {
      objective_id: gate.objective_id,
      objective: objective.description,
      required_status: gate.status,
      current_status: objective.status,
      is_open: objective.status === gate.status,
    };
  }
  return result;
}

/** Short pill text for the Build-mode canvas. Openness is carried separately
 *  on `gate.is_open` so the caller decides how to style it — this only
 *  supplies the words. */
export function questRouteGateLabel(gate: QuestRouteGate): string {
  return `${gate.objective} · ${QUEST_OBJECTIVE_STATUS_LABELS[gate.required_status]}`;
}

/** The sentence a Run-mode branch card shows, open or shut — the reason has
 *  to be visible on a closed route, not just the fact that it is closed. */
export function describeQuestRouteGate(gate: QuestRouteGate): string {
  const required = QUEST_OBJECTIVE_STATUS_LABELS[gate.required_status].toLowerCase();
  if (gate.is_open) return `Open — “${gate.objective}” is ${required}`;
  const current = QUEST_OBJECTIVE_STATUS_LABELS[gate.current_status].toLowerCase();
  return `Closed — needs “${gate.objective}” to be ${required}, currently ${current}`;
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
