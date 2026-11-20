// The class features a party member the AI plays (an ally, #1021) fights with, read from the sheet's own class rows and
// the sheet's own feature catalogue (`SRD_2014_FEATURES`, `SRD_2024_FEATURES`), so a rule is written once: Sneak Attack's
// dice are the catalogue's `scaling` at the class level, and which attacks it rides on is the catalogue rider's
// `applies_to` read through `ridersFor` over the sheet's own `AttackShape`. Only what the catalogue cannot say lives here:
// how many attacks the Attack action holds (no catalogue row carries Extra Attack; the sheet leaves it to the player).
// Pure and edge-importable (relative `.ts` imports only).

import type { CharacterClass } from "../../../types/multiclass.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackShape } from "../../features/resolve.ts";
import { ridersFor, scalingAt } from "../../features/resolve.ts";
import { SRD_2014_FEATURES } from "../../features/catalogue/srd2014.ts";
import { SRD_2024_FEATURES } from "../../features/catalogue/srd2024.ts";
import type { FeatureMechanics } from "../../features/mechanics.types.ts";

/** The rows of a member's classes that the book's own class features hang on: the SRD classes, not a homebrew one that shares a name. */
function systemClasses(classes: readonly CharacterClass[]): CharacterClass[] {
  return classes.filter((c) => c.class_definition_kind === "system");
}

const levelIn = (classes: readonly CharacterClass[], name: string): number =>
  systemClasses(classes).filter((c) => c.class_name.trim().toLowerCase() === name).reduce((sum, c) => sum + c.levels, 0);

/**
 * RULE extra-attack (PHB 2014 "Extra Attack" of the Barbarian, Fighter, Monk, Paladin and Ranger; the 2024 Player's Handbook
 * gives the same classes the same feature): at 5th level the Attack action makes two attacks instead of one, and a Fighter makes
 * three at 11th and four at 20th level. The feature does not stack between classes ("if you gain Extra Attack from more than
 * one source, the extra attacks don't add"), so the best one counts. A level of Fighter counts only the Fighter's own levels,
 * and a homebrew class is not read. Not read yet: a College of Valor or Swords Bard's (6th level), the Warlock's Thirsting Blade.
 * Returns the attacks one Attack action holds, 1 when there is no Extra Attack.
 */
export function attacksPerAttackAction(classes: readonly CharacterClass[]): number {
  let attacks = 1;
  for (const name of ["barbarian", "monk", "paladin", "ranger"]) if (levelIn(classes, name) >= 5) attacks = Math.max(attacks, 2);
  const fighter = levelIn(classes, "fighter");
  if (fighter >= 20) attacks = Math.max(attacks, 4);
  else if (fighter >= 11) attacks = Math.max(attacks, 3);
  else if (fighter >= 5) attacks = Math.max(attacks, 2);
  return attacks;
}

/** A catalogue feature's mechanics for this edition: the one the sheet itself resolves a character's feature to. */
function catalogueRow(ruleset: RulesetKey, key2014: string, key2024: string): FeatureMechanics | undefined {
  return ruleset === "2024" ? SRD_2024_FEATURES[key2024] : SRD_2014_FEATURES[key2014];
}

/** What Sneak Attack adds on a hit: its dice and the weapon-damage rule it rides, both the sheet's own. */
export interface SneakAttack {
  dice: string;
}

/**
 * RULE sneak-attack (PHB 2014 "Rogue: Sneak Attack"; PHB 2024 "Sneak Attack"): once per turn, a hit with a finesse or ranged
 * weapon adds the Rogue's Sneak Attack dice (1d6 at 1st level, one more every two levels) when the attacker has advantage
 * on the roll, or another enemy of the target is within 5 feet of it, is not incapacitated, and the attacker has no
 * disadvantage. The dice are the catalogue's `scaling` at the Rogue's level; the attacks it rides are the catalogue
 * rider's `applies_to` over the attack's sheet shape (`ridersFor`). Null when the member has no Rogue levels or this
 * attack is not one it rides (a spell, Unarmed Strike, a heavy melee weapon, a custom attack the sheet gave no shape).
 */
export function sneakAttackFor(classes: readonly CharacterClass[], ruleset: RulesetKey, shape: AttackShape | null): SneakAttack | null {
  const level = levelIn(classes, "rogue");
  if (level < 1 || shape === null) return null;
  const row = catalogueRow(ruleset, "srd_rogue_sneak-attack", "srd-2024_rogue_sneak-attack");
  if (row === undefined || row.scaling === undefined || row.riders === undefined) return null;
  if (ridersFor(row.riders, shape, new Set()).length === 0) return null;
  const dice = scalingAt(row.scaling, level);
  return dice === null ? null : { dice };
}
