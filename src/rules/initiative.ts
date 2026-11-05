import { abilityMod } from "@/rules/weaponAttack";
import { jackOfAllTradesBonus, type JackOfAllTrades } from "@/rules/skillCheck";
import { getExhaustionD20Penalty, hasCheckDisadvantage } from "@/rules/conditions";
import type { RulesetKey } from "@/types/ruleset.types";
import type { AppliedCondition } from "@/types/condition.types";
import type { WildshapeState } from "@/types/encounter.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The one initiative rule (#1149). Every place that rolls or shows initiative
 * reads it: the player sheet, Hearth, the player's encounter panel, the DM's
 * runner (each roll button, Roll all, the Start roll), the Random Initiative
 * Each Round re-roll and the turn-order tie-break. A character on their sheet
 * and a combatant in a fight are both an `InitiativeSource`, so the same
 * character rolls the same number whoever presses the button.
 *
 * Initiative is a Dexterity check (PHB 2014 and SRD 5.2 "Initiative"), so it
 * takes what a check takes: the DEX modifier (a Wild Shape form's DEX replaces
 * the character's, in both editions), what the character adds to it (Alert and
 * similar, `party_members.initiative_bonus`, and a 2014 Bard's Jack of All
 * Trades), and the check's conditions.
 */
export interface InitiativeSource {
  /** The creature's own DEX modifier. */
  dex_mod: number;
  /**
   * A 2024 stat block's printed initiative (monsters and NPCs only). It is the
   * whole modifier, so it replaces DEX and everything else.
   */
  initiative_bonus?: number | null;
  /**
   * What a character adds to DEX: `party_members.initiative_bonus` plus Jack of
   * All Trades. Absent for a creature that adds nothing (monsters, companions).
   */
  initiative_extra?: number;
  /** An active Wild Shape form, whose DEX score replaces the character's. */
  wildshape?: Pick<WildshapeState, "beast_dex"> | null;
}

/** The d20 modifier an initiative roll adds, before conditions. Also the turn order's tie-break. */
export function initiativeModifier(c: InitiativeSource): number {
  if (c.initiative_bonus !== undefined && c.initiative_bonus !== null) return c.initiative_bonus;
  const dexMod = c.wildshape ? abilityMod(c.wildshape.beast_dex) : c.dex_mod;
  return c.initiative_extra === undefined ? dexMod : dexMod + c.initiative_extra;
}

/**
 * An initiative roll: the modifier plus the 2024 Exhaustion penalty, and
 * disadvantage where a condition imposes it on ability checks (Poisoned,
 * Frightened, 2014 Exhaustion). `ruleset` is the edition whose condition
 * rules apply (the table's).
 */
export function initiativeRoll(
  c: InitiativeSource & { conditions: readonly AppliedCondition[] },
  ruleset: RulesetKey,
): { modifier: number; disadvantage: boolean } {
  return {
    modifier: initiativeModifier(c) + getExhaustionD20Penalty(c.conditions, ruleset),
    disadvantage: hasCheckDisadvantage(c.conditions, ruleset),
  };
}

/** What a character adds to DEX for initiative: `initiative_bonus` (Alert and similar) and Jack of All Trades. */
export function characterInitiativeExtra(
  member: Pick<PartyMember, "initiative_bonus" | "proficiency_bonus">,
  jack: JackOfAllTrades,
): number {
  return member.initiative_bonus + jackOfAllTradesBonus(jack, member.proficiency_bonus, "ability");
}

/**
 * A character's own initiative, as a printed sheet shows it: their own DEX and
 * what they add to it, with no Wild Shape form and no passing condition.
 */
export function ownInitiativeModifier(
  member: Pick<PartyMember, "dex" | "initiative_bonus" | "proficiency_bonus">,
  jack: JackOfAllTrades,
): number {
  return initiativeModifier({ dex_mod: abilityMod(member.dex), initiative_extra: characterInitiativeExtra(member, jack) });
}

/**
 * A character, as an initiative source: their own DEX, what they add to it,
 * the Wild Shape form they wear, and their conditions. The combatant a fight
 * builds for them carries the same fields (`buildRunCombatants`).
 */
export function characterInitiativeSource(
  member: Pick<PartyMember, "dex" | "initiative_bonus" | "proficiency_bonus" | "wildshape_state" | "conditions">,
  jack: JackOfAllTrades,
): InitiativeSource & { conditions: readonly AppliedCondition[] } {
  return {
    dex_mod: abilityMod(member.dex),
    initiative_extra: characterInitiativeExtra(member, jack),
    wildshape: member.wildshape_state,
    conditions: member.conditions,
  };
}
