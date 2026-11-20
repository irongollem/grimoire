import { computed, toValue, type ComputedRef, type MaybeRefOrGetter } from "vue";
import { usePartyInventory } from "@/composables/items/usePartyInventory";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import { abilityModOf } from "@/composables/encounters/useRunnerPcAttacks";
import { inventoryItemRef } from "@/lib/itemRef";
import { pcAttackRowsOf, type CarriedWeapon } from "@/rules/fight/pcAttacks/rows";
import type { PcAttackRow, PcMeleeAttackRow, PcRangedAttackRow, PcThrownAttackRow, PcCustomAttackRow } from "@/types/pcAttack.types";
import type { Item } from "@/types/item.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import type { PartyMember } from "@/types/party.types";

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

/**
 * The attacks a party member can make right now, as reactive rows. The runner's attack list renders them, and the AI
 * table's fight reads the same rows to list and resolve a character's attacks. The weapon rules live in
 * `rules/fight/pcAttacks/rows` (pure, so the server uses them too); this wraps them in the browser's caches.
 */
export function usePcAttackRows(
  member: MaybeRefOrGetter<PartyMember | null | undefined>,
  options: PcAttackRowOptions = {},
): PcAttackRows {
  const { data: inventoryItems } = usePartyInventory();
  // Carried rows resolve by id, not through the edition-narrowed browse list (#961).
  const { items: vaultItems } = useStoredItemRefs(() => (inventoryItems.value ?? []).map(inventoryItemRef));

  const vaultItemMap = computed<Map<string, Item>>(() => {
    const map = new Map<string, Item>();
    for (const item of vaultItems.value) map.set(item.id, item);
    return map;
  });

  const memberInventory = computed(() => {
    const mid = toValue(member)?.id;
    return (inventoryItems.value ?? []).filter((i) => i.carried_by === mid);
  });

  const groups = computed(() => {
    const m = toValue(member);
    if (!m) return null;
    return pcAttackRowsOf({
      member: m,
      inventory: memberInventory.value,
      itemOf: (inv) => {
        const ref = inventoryItemRef(inv);
        return ref === null ? undefined : vaultItemMap.value.get(ref);
      },
      profBonus: options.profBonus !== undefined ? toValue(options.profBonus) : undefined,
      abilityMod: options.abilityMod ?? abilityModOf,
    });
  });

  const melee = computed(() => (groups.value === null ? [] : groups.value.melee));
  const ranged = computed(() => (groups.value === null ? [] : groups.value.ranged));
  const thrown = computed(() => (groups.value === null ? [] : groups.value.thrown));
  const custom = computed(() => (groups.value === null ? [] : groups.value.custom));
  const carriedWeapons = computed(() => (groups.value === null ? [] : groups.value.carriedWeapons));
  const all = computed<PcAttackRow[]>(() => [...melee.value, ...ranged.value, ...thrown.value, ...custom.value]);

  return { melee, ranged, thrown, custom, all, memberInventory, vaultItemMap, carriedWeapons };
}
