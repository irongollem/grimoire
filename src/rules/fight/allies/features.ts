// The class features a party member the AI plays (an ally, #1021) fights with, read from the sheet's own class rows and
// the sheet's own feature catalogue (`SRD_2014_FEATURES`, `SRD_2024_FEATURES`), so a rule is written once: Sneak Attack's
// dice are the catalogue's `scaling` at the class level, and which attacks it rides on is the catalogue rider's
// `applies_to` read through `ridersFor` over the sheet's own `AttackShape`. Only what the catalogue cannot say lives here:
// how many attacks the Attack action holds (no catalogue row carries Extra Attack; the sheet leaves it to the player).
// Pure and edge-importable (relative `.ts` imports only).

import type { AppliedCondition } from "../../../types/condition.types.ts";
import type { CharacterClass } from "../../../types/multiclass.types.ts";
import type { RulesetKey } from "../../../types/ruleset.types.ts";
import type { AttackShape } from "../../features/resolve.ts";
import { ridersFor, scalingAt } from "../../features/resolve.ts";
import { SRD_2014_FEATURES } from "../../features/catalogue/srd2014.ts";
import { SRD_2024_FEATURES } from "../../features/catalogue/srd2024.ts";
import type { FeatureMechanics, FeatureUses, UsesCost } from "../../features/mechanics.types.ts";
import { rechargeAt, riderDice, usesMaxAt } from "../../features/resolve.ts";
import { payCost, remainingUses, type Remaining } from "../../features/uses.ts";
import type { ResourcePool, StoredClassResources } from "../../features/characterFeatures.ts";
import { abilityMod } from "../../abilityScore.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import type { PlayerSheetRow, PlayerSheets } from "../playerSheet.ts";

/** The rows of a member's classes that the book's own class features hang on: the SRD classes, not a homebrew one that shares a name. */
function systemClasses(classes: readonly CharacterClass[]): CharacterClass[] {
  return classes.filter((c) => c.class_definition_kind === "system");
}

const levelIn = (classes: readonly CharacterClass[], name: string): number =>
  systemClasses(classes).filter((c) => c.class_name.trim().toLowerCase() === name).reduce((sum, c) => sum + c.levels, 0);

/** What the sheet says beyond a class's level that Extra Attack reads: the edition, and the choices the sheet keeps (`class_choices`). */
export interface ExtraAttackFacts {
  ruleset: RulesetKey;
  classChoices: Record<string, unknown>;
}

/** A name or names the sheet stored under a `class_choices` key (a pick is one string or a list of them), lower case. */
function pickedIn(choices: Record<string, unknown>, key: string): string[] {
  if (!Object.hasOwn(choices, key)) return [];
  const value = choices[key];
  const names = typeof value === "string" ? [value] : Array.isArray(value) ? value : [];
  return names.filter((v): v is string => typeof v === "string").map((v) => v.trim().toLowerCase());
}

/** The level of the Bard's class row whose subclass is one of the colleges that gives Extra Attack (0 when there is none). */
function extraAttackCollegeLevel(classes: readonly CharacterClass[], ruleset: RulesetKey): number {
  // PHB 2014 College of Valor and Xanathar's College of Swords; the 2024 Player's Handbook has Valor and no Swords.
  const colleges = ruleset === "2024" ? ["valor"] : ["valor", "swords"];
  return systemClasses(classes)
    .filter((c) => c.class_name.trim().toLowerCase() === "bard" && c.subclass_name !== null && colleges.includes(c.subclass_name.trim().toLowerCase().replace(/^college of /, "")))
    .reduce((sum, c) => sum + c.levels, 0);
}

/** What one attack is, as far as Extra Attack cares: whether it is made with a weapon the Warlock's pact can bind (a held melee weapon, never bare hands). */
export interface ExtraAttackAttack {
  pactWeapon: boolean;
}

/**
 * RULE extra-attack (PHB 2014 "Extra Attack" of the Barbarian, Fighter, Monk, Paladin and Ranger; the 2024 Player's Handbook
 * gives the same classes the same feature): at 5th level the Attack action makes two attacks instead of one, and a Fighter makes
 * three at 11th and four at 20th level. The feature does not stack between classes ("if you gain Extra Attack from more than
 * one source, the extra attacks don't add"), so the best one counts. A level of Fighter counts only the Fighter's own levels,
 * and a homebrew class is not read. Also read here, each from the sheet's own record of the choice:
 * a Bard of the College of Valor (PHB 2014 and 2024) or the College of Swords (Xanathar's, 2014 only) makes two attacks from 6th Bard
 * level (the class row's `subclass_name`); a Warlock with the Thirsting Blade invocation (PHB 2014 "Eldritch Invocations", 5th-level
 * Warlock with the Pact of the Blade; PHB 2024 the same) attacks twice with the pact weapon, which is the one attack the Invocation
 * names, so it counts for `pactWeapon` attacks only. APP CONVENTION: the sheet does not record which weapon is the pact weapon, so
 * every held melee weapon of a Warlock with Pact of the Blade stands for it. Pact of the Blade is read from `pact_boon` (the 2014 Pact
 * Boon) or from `eldritch_invocations` (where the 2024 Pact of the Blade is an invocation); Thirsting Blade from `eldritch_invocations`.
 * Returns the attacks one Attack action holds for this attack, 1 when there is no Extra Attack.
 */
export function attacksPerAttackAction(classes: readonly CharacterClass[], facts: ExtraAttackFacts, attack: ExtraAttackAttack): number {
  let attacks = 1;
  for (const name of ["barbarian", "monk", "paladin", "ranger"]) if (levelIn(classes, name) >= 5) attacks = Math.max(attacks, 2);
  const fighter = levelIn(classes, "fighter");
  if (fighter >= 20) attacks = Math.max(attacks, 4);
  else if (fighter >= 11) attacks = Math.max(attacks, 3);
  else if (fighter >= 5) attacks = Math.max(attacks, 2);
  if (extraAttackCollegeLevel(classes, facts.ruleset) >= 6) attacks = Math.max(attacks, 2);
  if (attack.pactWeapon && levelIn(classes, "warlock") >= 5) {
    const invocations = pickedIn(facts.classChoices, "eldritch_invocations");
    const blade = pickedIn(facts.classChoices, "pact_boon").includes("pact of the blade") || invocations.includes("pact of the blade");
    if (blade && invocations.includes("thirsting blade")) attacks = Math.max(attacks, 2);
  }
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

// ── limited uses: the one mechanism every class feature below spends through ────────────────────────────────

/**
 * The features an ally spends a limited use of, each tied to the sheet's own catalogue row (the same `uses`, `toggle` and
 * `actions` the sheet resolves for a player) and the class level it is gained at. `minLevel` is the class table's: the
 * catalogue's by-level amounts already read 0 below it for Action Surge, but Rage and Second Wind are level 1 and the Monk's
 * Ki and Focus points begin at 2nd level (the catalogue gives `class_level`, which would read 1 at 1st level).
 */
export type AllyFeature = "second_wind" | "action_surge" | "rage" | "flurry";

interface FeatureSource {
  className: string;
  minLevel: number;
  key2014: string;
  key2024: string;
  /** The row's own action that carries the cost (Flurry of Blows spends Ki); absent: the use is spent by the feature itself. */
  action?: string;
}

const SOURCES: Record<AllyFeature, FeatureSource> = {
  second_wind: { className: "fighter", minLevel: 1, key2014: "srd_fighter_second-wind", key2024: "srd-2024_fighter_second-wind" },
  action_surge: { className: "fighter", minLevel: 2, key2014: "srd_fighter_action-surge", key2024: "srd-2024_fighter_action-surge" },
  rage: { className: "barbarian", minLevel: 1, key2014: "srd_barbarian_rage", key2024: "srd-2024_barbarian_rage" },
  flurry: { className: "monk", minLevel: 2, key2014: "srd_monk_ki", key2024: "srd-2024_monk_monks-focus", action: "Flurry of Blows" },
};

/** A feature the member has, with the pool it spends and what is left of it. */
export interface FeatureUse {
  feature: AllyFeature;
  classLevel: number;
  pool: ResourcePool;
  cost: UsesCost;
  /** What the sheet holds now: the stored entry, or the pool's maximum when none is stored (the sheet's own reading). */
  remaining: Remaining;
  /** The catalogue row, for what the feature adds besides its cost (Rage's damage, the Martial Arts die). */
  row: FeatureMechanics;
}

const classesOf = (sheets: PlayerSheets, memberId: string): CharacterClass[] => sheets.casting.classes.filter((c) => c.party_member_id === memberId);

/**
 * The member's use of `feature`, or null when they do not have it: no book class levels at its level, a Wild Shaped member (the
 * form's body fights, PHB 2014 "Wild Shape"), or a row the catalogue does not hold. The pool's maximum is the sheet's own
 * `usesMaxAt` over the class level, so it follows the edition's table.
 */
export function featureUse(sheets: PlayerSheets, memberId: string, feature: AllyFeature): FeatureUse | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null) return null;
  const source = SOURCES[feature];
  const classLevel = levelIn(classesOf(sheets, memberId), source.className);
  if (classLevel < source.minLevel) return null;
  const row = catalogueRow(member.ruleset, source.key2014, source.key2024);
  const uses: FeatureUses | undefined = row === undefined ? undefined : row.uses;
  if (row === undefined || uses === undefined) return null;
  const spends = source.action === undefined ? row.toggle?.spends : row.actions?.find((a) => a.name === source.action)?.spends;
  const cost: UsesCost = spends === undefined ? { key: uses.key, amount: 1 } : spends;
  const scores = { str: member.str, dex: member.dex, con: member.con, int: member.int, wis: member.wis, cha: member.cha };
  const pool: ResourcePool = {
    key: uses.key,
    label: uses.label,
    max: usesMaxAt(uses, { classLevel, proficiencyBonus: proficiencyBonusOf(member), abilityScores: scores }),
    recharge: rechargeAt(uses, classLevel),
    shortRestRegain: uses.short_rest_regain === undefined ? null : uses.short_rest_regain,
    pool: uses.pool,
    sources: [],
  };
  return { feature, classLevel, pool, cost, remaining: remainingUses(member.class_resources === undefined ? {} : member.class_resources, [pool], cost.key), row };
}

/** Whether the use can be paid now. */
export function featureReady(use: FeatureUse | null): use is FeatureUse {
  return use !== null && use.remaining !== null && (use.remaining === "unlimited" || use.remaining >= use.cost.amount);
}

/**
 * The sheet's `class_resources` after the feature is used once (`payCost`, the sheet's own spend), or null when nothing is
 * written: the pool is unlimited (2014 Rage at 20th level) or cannot be paid.
 */
export function featureSpend(sheets: PlayerSheets, memberId: string, feature: AllyFeature): StoredClassResources | null {
  const use = featureUse(sheets, memberId, feature);
  const member = sheets.members.find((m) => m.id === memberId);
  if (!featureReady(use) || member === undefined || use.remaining === "unlimited" || use.remaining === null) return null;
  return payCost(member.class_resources === undefined ? {} : member.class_resources, [use.pool], use.cost);
}

/** `featureSpend`'s write, kept in the sheet in memory so a second turn in the same request finds the use the first left. */
export function settleFeatureSpend(sheets: PlayerSheets, memberId: string, resources: StoredClassResources): void {
  const at = sheets.members.findIndex((m) => m.id === memberId);
  if (at !== -1) sheets.members[at] = { ...sheets.members[at], class_resources: resources };
}

/** The member's class rows, for a rule that reads levels (a bonus action, a die): the same rows `attacksPerAttackAction` reads. */
export function memberClasses(sheets: PlayerSheets, memberId: string): CharacterClass[] {
  return classesOf(sheets, memberId);
}

/** The Martial Arts die the Monk's catalogue row gives at this level ("d4" in 2014, "1d6" in 2024), or null for a member with no Monk levels. */
export function martialArtsDie(sheets: PlayerSheets, memberId: string): string | null {
  const member = sheets.members.find((m) => m.id === memberId);
  const level = levelIn(classesOf(sheets, memberId), "monk");
  if (member === undefined || member.wildshape_state !== null || level < 1) return null;
  const row = catalogueRow(member.ruleset, "srd_monk_martial-arts", "srd-2024_monk_martial-arts");
  return row === undefined || row.scaling === undefined ? null : scalingAt(row.scaling, level);
}

/** The Strength and Dexterity modifiers, for the unarmed strike of a Monk (the better of the two). */
export const bestOfStrAndDex = (member: Pick<PlayerSheetRow, "str" | "dex">): number => Math.max(abilityMod(member.str), abilityMod(member.dex));

/**
 * RULE rage (PHB 2014 "Barbarian: Rage"; PHB 2024 "Rage"): while raging, a Strength weapon attack adds the Rage Damage (+2 at 1st
 * level, +3 at 9th, +4 at 16th) and the Barbarian has resistance to bludgeoning, piercing and slashing damage. The damage is the
 * catalogue's `scaling`, and the attacks it rides are the catalogue riders' `applies_to` over the attack's sheet shape with the
 * `rage` toggle on (`ridersFor`); the 2024 rider also rides an Unarmed Strike. Null when the member has no Rage, or the attack is not one
 * it rides.
 */
export function rageDamageFor(sheets: PlayerSheets, memberId: string, shape: AttackShape | null): number | null {
  const use = featureUse(sheets, memberId, "rage");
  if (use === null || shape === null || use.row.riders === undefined || use.row.scaling === undefined) return null;
  if (ridersFor(use.row.riders, shape, new Set(["rage"])).length === 0) return null;
  const dice = scalingAt(use.row.scaling, use.classLevel);
  const amount = dice === null ? Number.NaN : Number(dice);
  return Number.isInteger(amount) ? amount : null;
}

/** The damage a Rage resists (PHB 2014 and 2024 "Rage"). */
export const RAGE_RESISTANCES = ["bludgeoning", "piercing", "slashing"] as const;

/** The name of the condition a Rage puts on the Barbarian (and the one the damage and the resistance read). */
export const RAGING = "Raging";

/** What a Divine Smite adds to a hit: the slot it spends and the radiant dice, as separate parts of the hit. */
export interface DivineSmite {
  slotLevel: number;
  dice: string[];
  /** 2024: the smite is a spell cast as a Bonus Action after the hit, so it needs the Bonus Action. 2014: a feature, no action. */
  needsBonusAction: boolean;
}

/**
 * RULE divine-smite (PHB 2014 "Paladin: Divine Smite", from 2nd level; PHB 2024 "Divine Smite", a spell the Paladin always has prepared from
 * 2nd level): on a hit with a melee weapon attack, spend a spell slot for 2d8 radiant damage plus 1d8 for each slot level above 1st (at most
 * 5d8), and 1d8 more against a fiend or an undead. In 2014 it costs nothing but the slot; in 2024 it is cast as a Bonus Action after the
 * hit. The dice are the catalogue rider's own (`riderDice` over the slot spent, the fixed die of its fiend and undead rider); the attacks it rides are its
 * `applies_to` over the attack's sheet shape (`ridersFor`). The 2024 spell uses the same dice, so the one catalogue row serves both editions.
 * APP CONVENTION, the ally's tactic and not a rule of the book: it spends the lowest slot the Paladin has unspent (the thrifty choice, the slots being what its spells want too).
 * Not modelled: Paladin's Smite (the 2024 free cast once per long rest), Improved Divine Smite, Pact Magic slots.
 */
export function divineSmiteFor(sheets: PlayerSheets, memberId: string, shape: AttackShape | null, againstFiendOrUndead: boolean): DivineSmite | null {
  const member = sheets.members.find((m) => m.id === memberId);
  if (member === undefined || member.wildshape_state !== null || shape === null) return null;
  if (levelIn(classesOf(sheets, memberId), "paladin") < 2) return null;
  const riders = SRD_2014_FEATURES["srd_paladin_divine-smite"]?.riders;
  if (riders === undefined || ridersFor(riders, shape, new Set()).length === 0) return null;
  const slotted = riders.find((r) => r.dice.kind === "slot");
  const fixed = riders.find((r) => r.dice.kind === "fixed");
  const slot = member.spell_slots.filter((s) => s.level >= 1 && s.used < s.max).sort((a, b) => a.level - b.level)[0];
  if (slotted === undefined || slot === undefined) return null;
  const base = riderDice(slotted, { scalingValue: null, slotLevel: slot.level });
  if (base === null) return null;
  const extra = againstFiendOrUndead && fixed !== undefined ? riderDice(fixed, { scalingValue: null }) : null;
  return { slotLevel: slot.level, dice: extra === null ? [base] : [base, extra], needsBonusAction: member.ruleset === "2024" };
}

/** The Raging condition: one minute, ten rounds, which also ends it with the fight (`conditionsAfterFight` drops a condition with an end). */
export function ragingCondition(moverId: string): AppliedCondition {
  return { name: RAGING, source: { id: moverId, spell: "Rage" }, ends: { kind: "rounds", remaining: 10 } };
}

/**
 * Whether the sheet says this member is already raging (`class_choices.rage_active`, the feature toggle the sheet switches on when a player
 * starts a Rage, `withToggle`): a Barbarian whose player raged by hand before the fight. False for a member with no Rage, or Wild Shaped.
 * The sheet keeps no time left, so the fight gives it the full minute.
 */
export function rageStartedOnSheet(sheets: PlayerSheets, memberId: string): boolean {
  const member = sheets.members.find((m) => m.id === memberId);
  return member !== undefined && member.class_choices.rage_active === true && featureUse(sheets, memberId, "rage") !== null;
}
