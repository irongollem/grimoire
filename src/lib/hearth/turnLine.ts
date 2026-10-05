import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import type { EncounterState, RunCombatant } from "@/types/encounter.types";

export interface CombatTurnLine {
  round: number;
  status: "lobby" | "your-turn" | "up-next" | "waiting";
  /** The visible combatant acting immediately before me; null when that one is hidden, unknown, or I am not in the order. */
  afterName: string | null;
}

type TurnState = Pick<
  EncounterState,
  "is_running" | "current_round" | "active_combatant_index" | "active_combatant_instance_id" | "combatants_live"
>;

/** PlayerEncounterPanel's rule: players always show, monsters/NPCs only once revealed. */
function isVisible(c: RunCombatant): boolean {
  return c.type === "player" || (c.reveal_state ?? "hidden") !== "hidden";
}

/**
 * "Where am I in the fight" for the Hearth, with PlayerEncounterPanel's rules:
 * the canonical initiative sort, the same active-combatant lookup (instance id
 * first, then the index into the sorted list), and hidden monsters never
 * named. If the combatant before me is hidden, `afterName` is null instead of
 * skipping to an earlier visible one, which would misstate the order.
 */
export function combatTurnLine(
  state: TurnState | null | undefined,
  myPartyMemberId: string | null | undefined,
): CombatTurnLine | null {
  if (!state || !state.is_running) return null;
  const round = state.current_round;
  if (round === 0) return { round, status: "lobby", afterName: null };

  const sorted = sortCombatantsByInitiative(state.combatants_live);
  const activeId = state.active_combatant_instance_id;
  const active = activeId
    ? (sorted.find((c) => c.instance_id === activeId) ?? null)
    : (sorted[state.active_combatant_index] ?? null);

  const myIdx = myPartyMemberId ? sorted.findIndex((c) => c.party_member_id === myPartyMemberId) : -1;
  if (myIdx === -1) return { round, status: "waiting", afterName: null };

  const mine = sorted[myIdx];
  // First in the order: nobody precedes me this round, so there is no "after".
  const before = myIdx > 0 ? sorted[myIdx - 1] : null;
  const afterName = before && isVisible(before) ? before.name : null;

  if (active?.instance_id === mine.instance_id) return { round, status: "your-turn", afterName };
  const activeIdx = active ? sorted.indexOf(active) : -1;
  const isNext = activeIdx !== -1 && (activeIdx + 1) % sorted.length === myIdx;
  return { round, status: isNext ? "up-next" : "waiting", afterName };
}
