/**
 * The structured half of a stat block (#1017).
 *
 * A monster's actions used to be prose only, and the runner read numbers out of
 * that prose with a regex at render time: the first "+N to hit", the first dice
 * group. It could not tell the main hit from a rider, read a save DC, or expand
 * Multiattack, and when it misread an action nothing said so. Each entry now
 * carries a `structured` payload beside its prose. The prose stays what the DM
 * reads; the structure is what the runner rolls from.
 *
 * Every structure is checked against its own prose (`checkActionAgainstProse`):
 * the bonus, dice, DC and damage types it claims must appear in the text. That
 * check applies whoever produced the structure, because Open5e's own structured
 * attack data is not trustworthy (its 2014 goblin Scimitar is typed thunder with
 * no damage bonus). A structure that fails becomes `kind: "other"` with a
 * `review` reason: no roll button rather than a wrong one.
 *
 * This module is imported by edge functions as well as the app, so it uses
 * relative `.ts` imports only.
 */
import type { DamageType } from "./damage.types.ts";

/** Saving-throw abilities, lowercase three-letter codes. */
export const SAVE_ABILITIES = ["str", "dex", "con", "int", "wis", "cha"] as const;
export type SaveAbility = (typeof SAVE_ABILITIES)[number];

/**
 * The 15 SRD conditions a creature can be immune to. `CONDITIONS` in
 * `src/rules/conditions.ts` adds "Hidden", which is a tracking marker rather
 * than a condition and never appears in a stat block's immunities.
 */
export const SRD_CONDITION_NAMES = [
  "Blinded",
  "Charmed",
  "Deafened",
  "Exhaustion",
  "Frightened",
  "Grappled",
  "Incapacitated",
  "Invisible",
  "Paralyzed",
  "Petrified",
  "Poisoned",
  "Prone",
  "Restrained",
  "Stunned",
  "Unconscious",
] as const;
export type SrdConditionName = (typeof SRD_CONDITION_NAMES)[number];

/** One part of a damage roll, e.g. the "2d6 + 3 piercing" of a bite. */
export interface DamagePart {
  /** Dice expression as printed, normalised without spaces: "2d6+3", "1d8", or a flat "1". */
  dice: string;
  /** Null only when the prose names no type ("takes 1 damage"). */
  type: DamageType | null;
}

export interface AttackStructure {
  delivery: "melee" | "ranged" | "melee_or_ranged";
  bonus: number;
  /** Feet. */
  reach?: number;
  /** Feet; `long` is the disadvantage band of a ranged attack. */
  range?: { normal: number; long?: number };
  /** Damage on a hit. The first part is the main hit; later parts are riders ("plus 7 (2d6) poison"). */
  hit: DamagePart[];
}

export interface SaveStructure {
  ability: SaveAbility;
  dc: number;
  /** Damage on a failed save. Empty when the save only imposes an effect. */
  fail: DamagePart[];
  /** What a successful save takes of `fail`. "none" also covers saves with no damage at all. */
  success: "half" | "none";
  /** Conditions a failed save imposes outright. */
  conditions: SrdConditionName[];
}

export interface MultiattackStep {
  /** The name of another entry in the same stat block, as printed ("Bite", "Claw"). */
  action: string;
  count: number;
}

/**
 * One choice of an "options" entry ("The dragon uses one of the following breath
 * weapons."). Each option is a complete attack or save; recharge, uses and
 * legendary cost belong to the entry that holds the options.
 */
export interface ActionOption {
  /** As printed ("Fire Breath", "Sleep Breath"). */
  name: string;
  kind: "attack" | "save";
  attack?: AttackStructure;
  save?: SaveStructure;
}

export type ActionKind = "attack" | "save" | "multiattack" | "options" | "other";

/**
 * Where a structure came from.
 * - `parsed`: the deterministic parser read it from the prose.
 * - `extracted`: an agent read it (backfill only), then it passed the prose check.
 * - `manual`: a DM set it in the editor. The parser never overwrites a manual structure.
 */
export type ActionStructureSource = "parsed" | "extracted" | "manual";

export interface ActionStructure {
  kind: ActionKind;
  /** Present when `kind` is "attack". */
  attack?: AttackStructure;
  /**
   * Present when `kind` is "save", and also on an attack whose hit forces a save
   * ("...must succeed on a DC 13 Constitution saving throw or be poisoned").
   */
  save?: SaveStructure;
  /** "Recharge 5–6" is { min: 5, max: 6 }; "Recharge 6" is { min: 6, max: 6 }. */
  recharge?: { min: number; max: number };
  uses?: { count: number; per: "day" | "short_rest" | "long_rest" };
  /** Present when `kind` is "multiattack"; empty when the composition could not be read. */
  multiattack?: MultiattackStep[];
  /** Present when `kind` is "options": the user picks one each time the action is used. Two or more. */
  options?: ActionOption[];
  /** Legendary actions only: how many of the pool this costs. */
  legendary_cost?: number;
  source: ActionStructureSource;
  /**
   * Set when the structure could not be verified against the prose: why, for
   * whoever reviews it. A structure with a `review` is always `kind: "other"`,
   * so the runner offers no roll for it until a DM sets it by hand.
   */
  review?: string;
}

/** One trait, action, reaction, legendary or lair entry of a stat block. */
export interface StatBlockEntry {
  name: string;
  /** Plain text, or a stored Tiptap JSON string. The display truth. */
  description: string;
  structured: ActionStructure;
}

/** What lets a damage defense be bypassed: "nonmagical" resistance is bypassed by magical damage. */
export const DEFENSE_BYPASSES = ["magical", "silvered", "adamantine"] as const;
export type DefenseBypass = (typeof DEFENSE_BYPASSES)[number];

/**
 * Damage types sharing one qualifier, e.g. "bludgeoning, piercing, and slashing
 * from nonmagical attacks that aren't silvered" is
 * `{ types: [bludgeoning, piercing, slashing], unless: ["magical", "silvered"] }`.
 */
export interface DamageDefense {
  types: DamageType[];
  /** The defense does not apply to damage with any of these properties. */
  unless?: DefenseBypass[];
  /** A qualifier that is not a bypass ("while in dim light"), kept for the DM to judge. */
  note?: string;
}

/** A stat block's resistances, immunities, vulnerabilities and condition immunities, typed. */
export interface Defenses {
  resistances: DamageDefense[];
  immunities: DamageDefense[];
  vulnerabilities: DamageDefense[];
  condition_immunities: SrdConditionName[];
  /** Source text that named no damage type or SRD condition ("damage from spells"), kept so nothing is lost. */
  notes?: string;
}

/** A fresh empty `Defenses`; a function so no caller can share (and mutate) another's arrays. */
export function emptyDefenses(): Defenses {
  return { resistances: [], immunities: [], vulnerabilities: [], condition_immunities: [] };
}
