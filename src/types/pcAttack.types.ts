import type { WeaponAmmoTag } from "../rules/ammunition.ts";
import type { AttackShape } from "../rules/features/resolve.ts";

/** What the damage-rider picker needs from any weapon row. */
export interface PcAttackPickerFields {
  /** Stable key for UI state such as "which row has its damage panel open". */
  key: string;
  name: string;
  /** The weapon's own dice before the ability modifier, or null when the picker works it out. */
  baseDice: string | null;
  modifier: number;
  shape: AttackShape | null;
  damageType: string;
}

/** One attack a played character can make, as data. `kind` says which group it belongs to. */
export interface PcAttackRow extends PcAttackPickerFields {
  kind: "melee" | "ranged" | "thrown" | "custom";
  /** To-hit bonus; null only for a custom attack with nothing to roll (auto-hit or save-based). */
  attackBonus: number | null;
  /** Damage as a dice expression with the modifier folded in, or null for unarmed (fixed damage) and no-damage items. */
  damageDice: string | null;
  /** Unarmed strike only: the flat damage text, for example "3 bludgeoning". */
  damageFixed: string | null;
  description: string;
  /** Ranged weapons: the ammunition kind it fires, null for a self-charged weapon. Always null elsewhere. */
  ammoTag: WeaponAmmoTag | null;
  /** Ranged and thrown weapons: the weapon's normal and long range in feet, null when its item names none. Unset for melee and custom rows. */
  range?: { normal: number; long?: number } | null;
  /** The party inventory row the weapon comes from; null for unarmed, improvised and custom attacks. */
  weaponInvId: string | null;
}

export interface PcMeleeAttackRow extends PcAttackRow {
  kind: "melee";
  attackBonus: number;
}

export interface PcRangedAttackRow extends PcAttackRow {
  kind: "ranged";
  attackBonus: number;
  weaponInvId: string;
}

export interface PcThrownAttackRow extends PcAttackRow {
  kind: "thrown";
  attackBonus: number;
  weaponInvId: string;
}

export interface PcCustomAttackRow extends PcAttackRow {
  kind: "custom";
  /** The dice string the member typed, as stored. */
  customDamage: string;
  /** The damage type the member typed, null when left blank. `damageType` stays a placeholder for custom rows. */
  customDamageType: string | null;
}
