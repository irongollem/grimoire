import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * The same question PlayerEncounterPanel asks before it shows its "Roll for
 * initiative" card: the player has a combatant in the live encounter and that
 * combatant has no initiative yet. The header and the go-live toast use it to
 * point a phone player at /play/encounter, where the card lives.
 */
export function needsInitiativeRoll(
  combatants: readonly RunCombatant[] | null | undefined,
  memberId: string | null | undefined,
): boolean {
  if (!memberId || !combatants) return false;
  const mine = combatants.find((c) => c.party_member_id === memberId);
  return !!mine && mine.initiative == null;
}

export function useNeedsInitiativeRoll(
  combatants: MaybeRefOrGetter<readonly RunCombatant[] | null | undefined>,
  memberId: MaybeRefOrGetter<string | null | undefined>,
) {
  return computed(() => needsInitiativeRoll(toValue(combatants), toValue(memberId)));
}
