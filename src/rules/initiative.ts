import { abilityMod } from "./abilityScore.ts";
import { jackOfAllTradesBonus, type JackOfAllTrades } from "./skillCheck.ts";
import { getExhaustionD20Penalty, hasCheckDisadvantage } from "./conditions.ts";
import type { RulesetKey } from "../types/ruleset.types.ts";
import type { AppliedCondition } from "../types/condition.types.ts";
import type { WildshapeState } from "../types/encounter.types.ts";
import type { PartyMember } from "../types/party.types.ts";

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
 * Frightened, 2014 Exhaustion) or where a 2024 creature is surprised
 * (SRD 5.2 "Surprise": "Disadvantage on the Initiative roll"; the 2014 rules
 * cost a surprised creature its first turn instead, `losesFirstTurnToSurprise`).
 * `ruleset` is the edition whose rules apply (the table's). Initiative has no
 * advantage source in this app, so disadvantage here is a plain yes or no: two
 * sources of it are still one disadvantage, and nothing is left to cancel.
 */
export function initiativeRoll(
  c: InitiativeSource & { conditions: readonly AppliedCondition[]; surprised?: boolean },
  ruleset: RulesetKey,
): { modifier: number; disadvantage: boolean } {
  return {
    modifier: initiativeModifier(c) + getExhaustionD20Penalty(c.conditions, ruleset),
    disadvantage: hasCheckDisadvantage(c.conditions, ruleset) || (ruleset === "2024" && c.surprised === true),
  };
}

/**
 * Whether a creature cannot act in this round because it was surprised. PHB 2014 ch. 9 "Surprise": a surprised
 * creature cannot move or take an action on its first turn of the combat, and cannot take a reaction until that turn
 * ends. SRD 5.2 "Surprise" has no such loss (only Disadvantage on the Initiative roll), so under 2024 this is never
 * true. The first turn of the combat is round 1; the flag lifts when that turn ends (`next_turn`).
 */
export function losesFirstTurnToSurprise(c: { surprised?: boolean }, ruleset: RulesetKey, round: number): boolean {
  return ruleset === "2014" && round === 1 && c.surprised === true;
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

/**
 * Whether a creature cannot take a reaction because it is surprised. PHB 2014 ch. 9 "Surprise": "you can't take a
 * reaction until that turn ends". The flag is cleared when the creature's first turn ends, which is exactly when the
 * book lets it react again, so while it is set the reaction is withheld. SRD 5.2 "Surprise" only gives Disadvantage on
 * the Initiative roll, so under 2024 this is never true.
 */
export function cannotReactWhileSurprised(c: { surprised?: boolean }, ruleset: RulesetKey): boolean {
  return ruleset === "2014" && c.surprised === true;
}
