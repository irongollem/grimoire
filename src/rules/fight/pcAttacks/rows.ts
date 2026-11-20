// The attacks a played character can make, as data: the weapon rules that were once built inside the browser's
// `usePcAttackRows`, now pure so the server (an edge function) resolves a party member's turn with the same rows the
// runner lists. Relative `.ts` imports only (`rules/edgeImportable.test.ts` holds that).

import { inventoryItemRef, type ItemRefColumns } from "../../../lib/itemRef.ts";
import type { Item } from "../../../types/item.types.ts";
import type { PartyInventoryItem } from "../../../types/inventory.types.ts";
import type { PartyMember } from "../../../types/party.types.ts";
import type { PcCustomAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow } from "../../../types/pcAttack.types.ts";
import { abilityMod } from "../../abilityScore.ts";
import { weaponAmmoTag, weaponUsesChargesAsAmmo, isRangedWeaponItem } from "../../ammunition.ts";
import { proficiencyBonusOf } from "../../proficiencyBonus.ts";
import { isThrownWeapon } from "../../thrownWeapon.ts";
import { weaponAttackMod, weaponAbilityMod, weaponDamageType } from "../../weaponAttack.ts";

/** The member fields the weapon rules read; a server sheet row fits (it holds no level or custom attacks). */
export type PcAttackMember = Pick<PartyMember, "str" | "dex" | "proficiency_bonus"> & {
  level?: number;
  /** Absent for a sheet row that carries none: the member then has no custom attacks. */
  custom_attacks?: PartyMember["custom_attacks"];
};

/** A carried inventory row: what the rules read of it. */
export type PcCarriedRow = Pick<PartyInventoryItem, "id" | "name" | "slot"> & ItemRefColumns;

export interface CarriedWeapon {
  /** The party inventory row. */
  id: string;
  name: string;
}

export interface PcAttackRowsInput {
  member: PcAttackMember;
  /** The inventory rows this member carries (held and not). */
  inventory: readonly PcCarriedRow[];
  /** The item a carried row points at, through its campaign or library id; undefined when it cannot be resolved. */
  itemOf: (inv: PcCarriedRow) => Item | undefined;
  /** Defaults to the member's proficiency bonus. */
  profBonus?: number;
  /** Defaults to the 5e ability modifier. */
  abilityMod?: (score: number) => number;
}

export interface PcAttackRowGroups {
  melee: PcMeleeAttackRow[];
  ranged: PcRangedAttackRow[];
  thrown: PcThrownAttackRow[];
  custom: PcCustomAttackRow[];
  /** Weapons the member carries but does not hold (pack, belt, stored): the ones a turn's free interaction can draw. */
  carriedWeapons: CarriedWeapon[];
}

/**
 * A weapon's range from the text its item carries ("80/320 ft.", "150/600", "30 ft."): the normal range and, when
 * written, the long one. Null when the text names no distance, so no long range is ever claimed from it.
 */
export function parseWeaponRange(text: string | null | undefined): { normal: number; long?: number } | null {
  if (!text) return null;
  const pair = /(\d+)\s*\/\s*(\d+)/.exec(text);
  if (pair) return { normal: Number(pair[1]), long: Number(pair[2]) };
  const single = /(\d+)\s*(?:ft|feet)/i.exec(text);
  return single ? { normal: Number(single[1]) } : null;
}

const signed = (n: number) => `${n >= 0 ? "+" : ""}${n}`;

const isHeld = (inv: PcCarriedRow) => ["main_hand", "off_hand"].includes(inv.slot ?? "");

/** The attacks a party member can make right now, from what they hold. */
export function pcAttackRowsOf(input: PcAttackRowsInput): PcAttackRowGroups {
  const { member, inventory } = input;
  const mod = input.abilityMod ?? abilityMod;
  const prof = input.profBonus ?? proficiencyBonusOf(member);

  // A carried row points at its item by a campaign item's id or by a library item's (`inventoryItemRef`). Looking it
  // up by the campaign id alone left a rapier from the library out of its bearer's attacks altogether: the
  // character could only punch.
  const heldItem = (inv: PcCarriedRow): Item | undefined => (inventoryItemRef(inv) === null ? undefined : input.itemOf(inv));

  const heldInventory = inventory.filter(isHeld);

  // The same weapon test the attack rows use (`item_type === "weapon"` on the resolved item); a row the item lookup
  // cannot resolve is not offered, since nothing says it is a weapon.
  const carriedWeapons: CarriedWeapon[] = inventory
    .filter((inv) => !isHeld(inv) && heldItem(inv)?.item_type === "weapon")
    .map((inv) => ({ id: inv.id, name: inv.name }));

  const melee = (): PcMeleeAttackRow[] => {
    const m = member;
    const strMod = mod(m.str);
    const dexMod = mod(m.dex);
    const bestMod = Math.max(strMod, dexMod);
    const unarmedDmg = 1 + strMod;
    const impDice = `1d4${signed(bestMod)}`;
    const scores = { str: m.str, dex: m.dex, proficiencyBonus: prof };
    // Equipped melee weapons, built like the ranged and thrown rows from the shared weapon math.
    const weapons = heldInventory.flatMap((inv): PcMeleeAttackRow[] => {
      const item = heldItem(inv);
      if (!item || item.item_type !== "weapon" || isRangedWeaponItem(item) || weaponUsesChargesAsAmmo(item)) return [];
      const dmgMod = weaponAbilityMod(item, scores);
      const base = item.damage_rolls?.[0]?.dice ?? "1d4";
      const damageDice = `${base}${signed(dmgMod)}`;
      const props = item.properties;
      const usesStrength = props.includes("finesse") ? strMod >= dexMod : true;
      return [{
        kind: "melee",
        key: `melee:${inv.id}`,
        baseDice: base,
        modifier: dmgMod,
        shape: { kind: "weapon", melee: true, ranged: false, finesse: props.includes("finesse"), usesStrength },
        damageType: weaponDamageType(item),
        name: inv.name,
        attackBonus: weaponAttackMod(item, scores),
        damageDice,
        damageFixed: null,
        description: `Melee attack. Hit: ${damageDice} ${weaponDamageType(item)} damage.`,
        ammoTag: null,
        weaponInvId: inv.id,
      }];
    });
    return [
      ...weapons,
      {
        kind: "melee",
        key: "unarmed",
        baseDice: null,
        modifier: 0,
        // The picker works out the damage itself (1 + Strength, or the Martial Arts die).
        shape: { kind: "unarmed" },
        damageType: "bludgeoning",
        name: "Unarmed Strike",
        attackBonus: strMod + prof,
        damageDice: null,
        damageFixed: `${unarmedDmg} bludgeoning`,
        description: `Melee attack. Proficient. Hit: ${unarmedDmg} bludgeoning damage.`,
        ammoTag: null,
        weaponInvId: null,
      },
      {
        kind: "melee",
        key: "improvised",
        baseDice: "1d4",
        modifier: bestMod,
        shape: { kind: "weapon", melee: true, finesse: false, ranged: false, usesStrength: strMod >= dexMod },
        damageType: "damage",
        name: "Improvised Weapon",
        attackBonus: bestMod,
        damageDice: impDice,
        damageFixed: null,
        description: `Melee or ranged attack. No proficiency bonus. Hit: ${impDice} damage (type varies).`,
        ammoTag: null,
        weaponInvId: null,
      },
    ];
  };

  const ranged = (): PcRangedAttackRow[] => {
    const m = member;
    const dexMod = mod(m.dex);
    const strMod = mod(m.str);
    return heldInventory.flatMap((inv): PcRangedAttackRow[] => {
      const item = heldItem(inv);
      if (!item) return [];
      const isSelfCharged = weaponUsesChargesAsAmmo(item);
      const ammoTag = isSelfCharged ? null : weaponAmmoTag(item);
      if (!item.properties.includes("ammunition") && !isSelfCharged && !ammoTag) return [];
      const usesStr = item.properties.includes("finesse") && strMod > dexMod;
      const atkMod = (usesStr ? strMod : dexMod) + prof;
      const dmgMod = usesStr ? strMod : dexMod;
      let damageDice: string | null = null;
      if (item.damage_rolls?.length) {
        damageDice = `${item.damage_rolls[0].dice}${signed(dmgMod)}`;
      }
      const rangeStr = item.weapon_range ? ` (${item.weapon_range})` : "";
      return [{
        kind: "ranged",
        key: inv.id,
        baseDice: item.damage_rolls?.[0]?.dice ?? null,
        modifier: dmgMod,
        shape: {
          kind: "weapon", melee: false, ranged: true,
          finesse: item.properties.includes("finesse"),
          usesStrength: usesStr,
        },
        damageType: item.damage_rolls?.[0]?.type ?? "damage",
        name: item.name,
        attackBonus: atkMod,
        damageDice,
        damageFixed: null,
        description: `Ranged attack${rangeStr}. Hit: ${damageDice ?? "see item"} ${item.damage_rolls?.[0]?.type ?? "damage"}.`,
        ammoTag,
        range: parseWeaponRange(item.weapon_range),
        weaponInvId: inv.id,
      }];
    });
  };

  // Thrown weapons (javelin, dagger, handaxe, spear) can be hurled at range. The STR-unless-finesse math comes
  // from the shared weaponAttack lib so it matches the player combat tab exactly.
  const thrown = (): PcThrownAttackRow[] => {
    const m = member;
    const scores = { str: m.str, dex: m.dex, proficiencyBonus: prof };
    const strMod = mod(m.str);
    const dexMod = mod(m.dex);
    return heldInventory.flatMap((inv): PcThrownAttackRow[] => {
      const item = heldItem(inv) ?? null;
      if (!isThrownWeapon(inv.name, item)) return [];
      const dmgMod = weaponAbilityMod(item, scores);
      const base = item?.damage_rolls?.[0]?.dice ?? "1d4";
      const damageDice = `${base}${signed(dmgMod)}`;
      const isRanged = item !== null && isRangedWeaponItem(item);
      const props = item?.properties ?? [];
      // Mirrors weaponAbilityMod: ammunition is Dexterity, finesse takes the better score.
      const usesStrength = props.includes("ammunition") ? false : props.includes("finesse") || item === null ? strMod >= dexMod : true;
      return [{
        kind: "thrown",
        key: inv.id,
        baseDice: base,
        modifier: dmgMod,
        shape: { kind: "weapon", melee: !isRanged, ranged: isRanged, finesse: props.includes("finesse"), usesStrength },
        damageType: weaponDamageType(item),
        name: inv.name,
        attackBonus: weaponAttackMod(item, scores),
        damageDice,
        damageFixed: null,
        description: "Thrown attack. The weapon lands on the ground, recoverable from chat.",
        ammoTag: null,
        range: parseWeaponRange(item?.weapon_range),
        weaponInvId: inv.id,
      }];
    });
  };

  const custom = (): PcCustomAttackRow[] =>
    (member.custom_attacks === undefined ? [] : member.custom_attacks).map((atk): PcCustomAttackRow => ({
      kind: "custom",
      key: atk.id,
      baseDice: null,
      modifier: 0,
      shape: null,
      damageType: "damage",
      name: atk.name,
      attackBonus: atk.attack_bonus ?? null,
      damageDice: null,
      damageFixed: null,
      customDamage: atk.damage,
      customDamageType: atk.damage_type,
      description: "Custom attack.",
      ammoTag: null,
      weaponInvId: null,
    }));


  return { melee: melee(), ranged: ranged(), thrown: thrown(), custom: custom(), carriedWeapons };
}
