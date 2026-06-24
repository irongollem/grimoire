import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import { truncateCard } from "@/types/card.types";
import { damageTypesFromRolls } from "@/lib/damageIcons";

/**
 * Normalized data for an Item card — design-agnostic.
 */
export function useItemCardData(data: MaybeRefOrGetter<Item>) {
  const portrait = computed(() => toValue(data).image_url ?? null);
  const rarity = computed(() => toValue(data).rarity);

  const typeTag = computed(
    () =>
      (
        ITEM_TYPE_LABELS[toValue(data).item_type] ??
        toValue(data).item_type ??
        "Item"
      ).toUpperCase() +
      " · " +
      (
        ITEM_RARITY_LABELS[toValue(data).rarity] ?? toValue(data).rarity
      ).toUpperCase(),
  );

  const typeLine = computed(() => {
    const d = toValue(data);
    const type = d.subtype || ITEM_TYPE_LABELS[d.item_type] || d.item_type;
    const wt = d.weight ? ` (${d.weight} lb.)` : "";
    return type ? type + wt : "—";
  });

  const weight = computed(() =>
    toValue(data).weight ? toValue(data).weight + " lb" : "—",
  );
  const attuneLabel = computed(() =>
    toValue(data).requires_attunement ? "Yes" : "No",
  );

  const stats = computed(() => [
    { label: "WT", value: weight.value },
    { label: "ATT", value: attuneLabel.value },
  ]);

  const damageTypes = computed(() =>
    damageTypesFromRolls(toValue(data).damage_rolls),
  );

  const metaRows = computed(() => {
    const d = toValue(data);
    const rows: Array<{ label: string; value: string }> = [];
    if (d.requires_attunement)
      rows.push({ label: "Attunem.", value: "Required" });
    if (d.properties?.length)
      rows.push({ label: "Props.", value: d.properties.join(", ") });
    return rows;
  });

  return {
    portrait,
    rarity,
    typeTag,
    typeLine,
    weight,
    attuneLabel,
    stats,
    metaRows,
    damageTypes,
    truncate: truncateCard,
  };
}
