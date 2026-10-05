import { computed } from "vue";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { useStoredItemRefs } from "@/composables/items/useStoredItemRefs";
import type { LootPoolItem } from "@/lib/dungeon-features/lootTableRoll";

/**
 * The items a loot table can offer and roll from, shared by the loot table
 * editor and the location loot panel.
 *
 * The picker (`itemOptions`) offers what the enabled books, edition and campaign
 * scope allow; library rows are references, and the index already holds only
 * this account's own rows. The entries a table already stores resolve by id
 * whatever they are now, so disabling a book never makes a roll silently drop one
 * (#954, #961). A random entry rolls from every item that fits its rarity and
 * type: the index, already loaded, plus those stored items (`itemsById`).
 */
export function useLootPool(getStoredItemIds: () => string[]) {
  const index = useItemIndex();
  const { items: storedItems } = useStoredItemRefs(getStoredItemIds);

  const itemsById = computed(() => {
    const map = new Map<string, LootPoolItem>();
    for (const item of index.data.value ?? []) map.set(item.id, item);
    for (const item of storedItems.value) map.set(item.id, item);
    return map;
  });
  const itemOptions = computed(() => (index.data.value ?? []).map((item) => ({ id: item.id, name: item.name })));

  return { itemsById, itemOptions, isLoading: index.isLoading };
}
