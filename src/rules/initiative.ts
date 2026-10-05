import { abilityMod } from "@/rules/weaponAttack";
import type { PartyMember } from "@/types/party.types";

/**
 * Initiative modifier: DEX modifier plus `initiative_bonus` (feat and special
 * extras such as Alert). While Wild Shaped the form's DEX replaces the
 * character's (2014 and 2024 alike), so pass the effective DEX as `dex`; it
 * defaults to the character's own. Shared by the player sheet header and the Hearth card.
 * A combatant in a running encounter has its own, `combatantSort.initiativeModifier`.
 */
export function memberInitiativeModifier(
  member: Pick<PartyMember, "dex" | "initiative_bonus">,
  dex: number = member.dex,
): number {
  return abilityMod(dex) + member.initiative_bonus;
}
