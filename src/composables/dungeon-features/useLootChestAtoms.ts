import { computed, toValue } from "vue";
import type { MaybeRefOrGetter } from "vue";
import { useItemsByIds } from "@/composables/items/useItemsByIds";
import type { RolledLootEntry } from "@/lib/dungeon-features/lootTableRoll";
import type { LootChestAtom } from "@/types/chat.types";

/**
 * Turn a loot roll into the atoms of a chest. An item atom carries its rarity and
 * whether it is a container, which only the full row knows, so the rolled ids (a
 * handful) are read by id rather than the pool the roll drew from (#972).
 * `isLoading` is true until those rows have arrived: hold a chest back until then,
 * or an item's container flag is written as false.
 */
export function useLootChestAtoms(rolled: MaybeRefOrGetter<readonly RolledLootEntry[]>) {
  const rolledIds = computed(() =>
    toValue(rolled).flatMap((entry) => (entry.type === "item" ? [entry.item_id] : [])),
  );
  const { data: itemsById, isLoading } = useItemsByIds(rolledIds);

  const atoms = computed<LootChestAtom[]>(() => {
    const out: LootChestAtom[] = [];
    for (const entry of toValue(rolled)) {
      if (entry.type === "item") {
        const item = itemsById.value.get(entry.item_id);
        for (let i = 0; i < entry.qty; i++) {
          out.push({
            atom_id: crypto.randomUUID(),
            type: "item",
            item_id: entry.item_id,
            item_name: entry.item_name,
            item_image_url: entry.item_image_url ?? null,
            item_rarity: item?.rarity ?? null,
            item_is_container: item?.tags.includes("container") ?? false,
          });
        }
      } else if (entry.type === "currency") {
        out.push({
          atom_id: crypto.randomUUID(),
          type: "currency",
          currency_label: entry.currency_label ?? null,
          pp: entry.pp, gp: entry.gp, ep: entry.ep, sp: entry.sp, cp: entry.cp,
        });
      }
      // "unresolved" entries hit but produced no loot: surfaced separately, never an atom.
    }
    return out;
  });

  return { atoms, isLoading };
}
