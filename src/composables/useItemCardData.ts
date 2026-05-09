import { computed, toValue, type MaybeRefOrGetter } from "vue";
import type { Item } from "@/types/item.types";
import { ITEM_TYPE_LABELS, ITEM_RARITY_LABELS } from "@/types/item.types";
import { truncateCard } from "@/types/card.types";

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

  const typeLine = computed(() =>
    [
      ITEM_RARITY_LABELS[toValue(data).rarity],
      toValue(data).subtype,
    ]
      .filter(Boolean)
      .join(" · "),
  );

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

  const metaRows = computed(() => {
    const d = toValue(data);
    const rows: Array<{ label: string; value: string }> = [
      { label: "Rarity", value: ITEM_RARITY_LABELS[d.rarity] ?? d.rarity },
      { label: "Type", value: ITEM_TYPE_LABELS[d.item_type] ?? d.item_type },
    ];
    if (d.subtype) rows.push({ label: "Subtype", value: d.subtype });
    if (d.cost) rows.push({ label: "Value", value: d.cost });
    if (d.weight) rows.push({ label: "Weight", value: d.weight + " lb." });
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
    truncate: truncateCard,
  };
}
