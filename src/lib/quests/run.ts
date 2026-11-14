import { threadBadges } from "./threads";
import type {
  LootPlacement,
  LootPlacementKind,
  QuestBeatTransition,
  QuestConsequence,
  QuestConsequenceAction,
  QuestHeldPayoff,
  QuestRuntimeChoice,
  QuestThreadCursor,
} from "@/types/quest.types";

/**
 * Alt+→ means "advance when unambiguous," and unambiguous is a fact about the
 * ledger now, not about the graph: a route the gate holds shut does not count
 * as a candidate, so it cannot silently block the shortcut when it sits beside
 * the one route that is actually open, and two open routes must not let the
 * shortcut guess between them (#795).
 */
export function soleOpenOutgoingEdgeId(outgoing: QuestRuntimeChoice[]): string | null {
  const open = outgoing.filter((choice) => !choice.gate || choice.gate.is_open);
  return open.length === 1 ? open[0]!.edge_id : null;
}

/**
 * The outgoing routes whose gate names this objective — the ledger's "gates
 * <target>" hint (`Main` board): a DM reading the objectives panel should see
 * not just that something is pending, but what taking it further unlocks.
 */
export function objectiveGateTargets(
  objectiveId: string,
  outgoing: readonly QuestRuntimeChoice[],
): string[] {
  return outgoing
    .filter((choice) => choice.gate?.conditions.some((condition) => condition.objective_id === objectiveId))
    .map((choice) => choice.beat_title);
}

/**
 * The letter of another thread whose *current* beat carries the rule that
 * raised this objective — the ledger's "· Thread B" hint. A beat has no
 * stored owning thread (several threads can walk through the same beat over
 * time), so "another thread's beat" is read as "a beat a sibling thread is
 * standing on right now," the one fact actually available without a second
 * round trip through the transition log.
 */
export function objectiveThreadHint(
  objectiveId: string,
  consequences: readonly QuestConsequence[],
  threads: readonly QuestThreadCursor[],
  currentThreadId: string,
): string | null {
  const raisingBeatIds = new Set(
    consequences
      .filter((row) => row.action === "raise" && row.target_objective_id === objectiveId && row.on_beat_id)
      .map((row) => row.on_beat_id as string),
  );
  if (!raisingBeatIds.size) return null;
  const hit = threadBadges(threads).find((badge) =>
    badge.thread.id !== currentThreadId
    && !!badge.thread.current_beat_id
    && raisingBeatIds.has(badge.thread.current_beat_id));
  return hit?.letter ?? null;
}

const HELD_PAYOFF_ACTION_LABELS: Record<QuestConsequenceAction, string> = {
  raise: "Raises an objective",
  complete: "Achieves an objective",
  fail: "Fails an objective",
  create_calendar_event: "Schedules a calendar event",
  send_broadcast: "Sends a broadcast",
  shift_npc_relationship: "Shifts an NPC's disposition",
  unlock_quest: "Unlocks a quest",
  grant_knowledge: "Grants knowledge",
  owe_favor: "Owes a favor",
  award_milestone: "Awards a milestone",
  give_handout: "Gives a handout",
  tick_clock: "Ticks a clock",
  move_npc: "Moves an NPC",
  add_companion: "Adds a companion",
  shift_faction_standing: "Shifts faction standing",
};

/**
 * A held consequence event's own label in the opened beat's Held payoff panel.
 * `QuestHeldPayoff` (unlike `QuestRoutePayoff`) carries only ids, not resolved
 * names — the event log was never joined for display, since the log's only
 * reader needs the action alone — so this names
 * the action alone rather than guessing at a target it cannot see.
 */
export function describeHeldPayoff(payoff: QuestHeldPayoff): string {
  return HELD_PAYOFF_ACTION_LABELS[payoff.action];
}

/**
 * "currency · prepared" / "item · unclaimed once dispatched" — the Held
 * payoff panel's caption for a piece of loot still waiting on a drop.
 * Currency is inert once rolled (nothing left to claim once it's in a
 * player's pocket), so it reads as ready; an item or a chest stays open until
 * someone actually claims it in chat.
 */
export function describeHeldLoot(kind: LootPlacementKind): string {
  return kind === "currency" ? `${kind} · prepared` : `${kind} · unclaimed once dispatched`;
}

/**
 * The loot the opened beat's Held payoff offers: undispatched loot on a beat this
 * quest's run has entered (#1164). `delivery_state: "held"` alone only means
 * "not dropped yet", which every piece of prepared loot is, so on its own it
 * listed the whole quest's loot on the first beat of a fresh run. Frame 04
 * holds the loot of the beat the party is on, and frame 05 has loot the DM
 * leaves unticked on Advance "stay waiting until you dispatch it":
 * both are beats the run reached. Any thread counts, since the panel is
 * quest-wide. An `assert` row moves no cursor, so it reaches nothing.
 */
export function lootHeldByTheRun(
  loot: readonly LootPlacement[],
  transitions: readonly QuestBeatTransition[],
  questId: string,
): LootPlacement[] {
  const reached = new Set<string>();
  for (const row of transitions) {
    if (row.transition_kind === "assert" || row.to_quest_id !== questId || !row.to_beat_id) continue;
    reached.add(row.to_beat_id);
  }
  return loot.filter((row) => row.delivery_state === "held" && row.beat_id !== null && reached.has(row.beat_id));
}
