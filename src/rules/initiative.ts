import { abilityMod } from "@/rules/weaponAttack";
import { jackOfAllTradesBonus, type JackOfAllTrades } from "@/rules/skillCheck";
import type { PartyMember } from "@/types/party.types";

/**
 * Initiative modifier: DEX modifier plus `initiative_bonus` (feat and special
 * extras such as Alert), plus Jack of All Trades where the edition lets it
 * reach a plain Dexterity check (2014 only, see `JackOfAllTrades`). While Wild
 * Shaped the form's DEX replaces the character's (2014 and 2024 alike), so pass
 * the effective DEX as `dex`; it defaults to the character's own. Shared by the
 * player sheet header, Hearth and the player's encounter panel.
 * A combatant in a running encounter has its own, `combatantSort.initiativeModifier`.
 */
export function memberInitiativeModifier(
  member: Pick<PartyMember, "dex" | "initiative_bonus" | "proficiency_bonus">,
  jack: JackOfAllTrades,
  dex: number = member.dex,
): number {
  return abilityMod(dex) + member.initiative_bonus + jackOfAllTradesBonus(jack, member.proficiency_bonus, "ability");
}
