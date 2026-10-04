import { computed } from "vue";
import { storeToRefs } from "pinia";
import { useItemIndex } from "@/composables/items/useItemIndex";
import { usePlayerItemProjection } from "@/composables/items/useItems";
import { useCampaignStore } from "@/stores/campaign";
import { useTableRuleset } from "@/composables/rules/useRuleset";
import { mergeLibraryWithCustom } from "@/lib/library/libraryShadow";
import type { Item, ItemIndexEntry } from "@/types/item.types";
import type { RulesetKey } from "@/types/ruleset.types";

/** The slim picker row of a projected custom item. Everything else is read when it is chosen. */
export function projectionIndexEntry(item: Item): ItemIndexEntry {
  return {
    id: item.id,
    name: item.name,
    item_type: item.item_type,
    subtype: item.subtype,
    rarity: item.rarity,
    cost: item.cost,
    source: item.source,
    source_document_key: item.source_document_key ?? null,
    source_record_key: item.source_record_key ?? null,
    image_url: item.image_url,
    is_shared: false,
    campaign_id: item.campaign_id,
    ruleset: item.ruleset ?? null,
  };
}

/**
 * What a player's add-item picker may offer, slim (#972): the library rows the
 * enabled books offer (`useItemIndex`) plus the custom items the player may see
 * (the gated projection), in the edition and campaign scope of the table.
 *
 * Library rows are read by id once picked (`fetchResolvedItem`); a custom row is
 * taken from the projection, the only place a player may read one.
 */
export function usePlayerItemPicker() {
  const index = useItemIndex();
  const projection = usePlayerItemProjection();
  const { activeCampaignId } = storeToRefs(useCampaignStore());
  const { ruleset } = useTableRuleset();

  const data = computed<ItemIndexEntry[] | undefined>(() => {
    const own = index.data.value;
    const projected = projection.data.value;
    if (own === undefined || projected === undefined) return undefined;
    const rs: RulesetKey = ruleset.value;
    const known = new Set(own.map((entry) => entry.id));
    const visible = projected
      .filter((item) => !item.ruleset || item.ruleset === rs)
      .filter((item) => item.campaign_id === null || item.campaign_id === activeCampaignId.value)
      .filter((item) => !known.has(item.id))
      .map(projectionIndexEntry);
    return mergeLibraryWithCustom(
      own.filter((entry) => entry.is_shared),
      [...own.filter((entry) => !entry.is_shared), ...visible],
    );
  });

  return { data, isLoading: computed(() => index.isLoading.value || projection.isLoading.value) };
}
