import { abilityMod } from "@/rules/weaponAttack";
import type { PartyMember } from "@/types/party.types";

/**
 * Initiative modifier: DEX modifier plus `initiative_bonus` (feat and special
 * extras such as Alert). Shared by the player sheet header and the Hearth card.
 * A combatant in a running encounter has its own, `combatantSort.initiativeModifier`.
 */
export function memberInitiativeModifier(
  member: Pick<PartyMember, "dex" | "initiative_bonus">,
): number {
  return abilityMod(member.dex) + member.initiative_bonus;
}
