import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { abilityModOf, proficiencyBonusOf } from "@/composables/encounters/useRunnerPcAttacks";
import { inventoryItemRef } from "@/lib/itemRef";
import { weaponAmmoTag, weaponUsesChargesAsAmmo, isRangedWeaponItem } from "@/rules/ammunition";
import { isThrownWeapon } from "@/rules/thrownWeapon";
import { weaponAttackMod, weaponAbilityMod, weaponDamageType } from "@/rules/weaponAttack";
import type { PcAttackPickerFields, PcAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow, PcCustomAttackRow } from "@/types/pcAttack.types";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

// The row shapes live in `@/types/pcAttack.types` so the lib code that reads them need not import a composable.
export type { PcAttackPickerFields, PcAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow, PcCustomAttackRow };

export interface PcAttackRowOptions {
  /** Defaults to the member's proficiency bonus. */
  profBonus?: MaybeRefOrGetter<number>;
  /** Defaults to the 5e ability modifier. */
  abilityMod?: (score: number) => number;
}

export interface PcAttackRows {
  melee: ComputedRef<PcMeleeAttackRow[]>;
  ranged: ComputedRef<PcRangedAttackRow[]>;
  thrown: ComputedRef<PcThrownAttackRow[]>;
  custom: ComputedRef<PcCustomAttackRow[]>;
  /** Every group in display order: melee, ranged, thrown, custom. */
  all: ComputedRef<PcAttackRow[]>;
  /** The party inventory rows carried by this member. */
  memberInventory: ComputedRef<PartyInventoryItem[]>;
  /** Item definitions for the carried rows, by item id. */
  vaultItemMap: ComputedRef<Map<string, Item>>;
  /** Weapons the member carries but does not hold (pack, belt, stored): the ones a turn's free interaction can draw. */
  carriedWeapons: ComputedRef<CarriedWeapon[]>;
}

export interface CarriedWeapon {
  /** The party inventory row. */
  id: string;
  name: string;
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

/**
 * The attacks a party member can make right now, as reactive rows. The runner's attack list renders them,
 * and the AI table's fight reads the same rows to list and resolve a character's attacks, so the weapon
 * rules live here once instead of inside a component.
 */
export function usePcAttackRows(
  member: MaybeRefOrGetter<PartyMember | null | undefined>,
  options: PcAttackRowOptions = {},
): PcAttackRows {
  const { data: inventoryItems } = usePartyInventory();
  // Carried rows resolve by id, not through the edition-narrowed browse list (#961).
  const { items: vaultItems } = useStoredItemRefs(() => (inventoryItems.value ?? []).map(inventoryItemRef));

  const abilityMod = options.abilityMod ?? abilityModOf;
  const profOf = (m: PartyMember) => (options.profBonus !== undefined ? toValue(options.profBonus) : proficiencyBonusOf(m));

  const vaultItemMap = computed<Map<string, Item>>(() => {
    const map = new Map<string, Item>();
    for (const item of vaultItems.value) map.set(item.id, item);
    return map;
  });

  const memberInventory = computed(() => {
    const mid = toValue(member)?.id;
    return (inventoryItems.value ?? []).filter((i) => i.carried_by === mid);
  });

  // A carried row points at its item by a campaign item's id or by a library item's (`inventoryItemRef`). Looking it
  // up by the campaign id alone left a rapier from the library out of its bearer's attacks altogether: the
  // character could only punch.
  const heldItem = (inv: Parameters<typeof inventoryItemRef>[0]): Item | undefined => {
    const ref = inventoryItemRef(inv);
    return ref === null ? undefined : vaultItemMap.value.get(ref);
  };

  const heldInventory = computed(() => memberInventory.value.filter((inv) => ["main_hand", "off_hand"].includes(inv.slot ?? "")));

  // The same weapon test the attack rows use (`item_type === "weapon"` on the resolved item); a row the item lookup
  // cannot resolve is not offered, since nothing says it is a weapon.
  const carriedWeapons = computed<CarriedWeapon[]>(() =>
    memberInventory.value
      .filter((inv) => !["main_hand", "off_hand"].includes(inv.slot ?? "") && heldItem(inv)?.item_type === "weapon")
      .map((inv) => ({ id: inv.id, name: inv.name })),
  );

  const melee = computed<PcMeleeAttackRow[]>(() => {
    const m = toValue(member);
    if (!m) return [];
    const strMod = abilityMod(m.str);
    const dexMod = abilityMod(m.dex);
    const prof = profOf(m);
    const bestMod = Math.max(strMod, dexMod);
    const unarmedDmg = 1 + strMod;
    const impDice = `1d4${signed(bestMod)}`;
    const scores = { str: m.str, dex: m.dex, proficiencyBonus: prof };
    // Equipped melee weapons, built like the ranged and thrown rows from the shared weapon math.
    const weapons = heldInventory.value.flatMap((inv): PcMeleeAttackRow[] => {
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
  });

  const ranged = computed<PcRangedAttackRow[]>(() => {
    const m = toValue(member);
    if (!m) return [];
    const dexMod = abilityMod(m.dex);
    const strMod = abilityMod(m.str);
    const prof = profOf(m);
    return heldInventory.value.flatMap((inv): PcRangedAttackRow[] => {
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
  });

  // Thrown weapons (javelin, dagger, handaxe, spear) can be hurled at range. The STR-unless-finesse math comes
  // from the shared weaponAttack lib so it matches the player combat tab exactly.
  const thrown = computed<PcThrownAttackRow[]>(() => {
    const m = toValue(member);
    if (!m) return [];
    const scores = { str: m.str, dex: m.dex, proficiencyBonus: profOf(m) };
    const strMod = abilityMod(m.str);
    const dexMod = abilityMod(m.dex);
    return heldInventory.value.flatMap((inv): PcThrownAttackRow[] => {
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
  });

  const custom = computed<PcCustomAttackRow[]>(() =>
    (m => (m ? m.custom_attacks : []))(toValue(member)).map((atk): PcCustomAttackRow => ({
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
    })));

  const all = computed<PcAttackRow[]>(() => [...melee.value, ...ranged.value, ...thrown.value, ...custom.value]);

  return { melee, ranged, thrown, custom, all, memberInventory, vaultItemMap, carriedWeapons };
}
