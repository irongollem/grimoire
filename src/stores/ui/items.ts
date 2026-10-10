// Vault (items) list filters.
import { defineStore } from "pinia";
import { ref, computed } from "vue";
import type { ItemType, ItemRarity } from "@/types/item.types";
import type { ItemScope } from "@/lib/items/itemScope";

export const useItemsUiStore = defineStore("ui:items", () => {
  // Vault (Items) UI state
  const vaultSearch = ref("");
  const vaultFilterType = ref<ItemType | "">("");
  const vaultFilterRarity = ref<ItemRarity | "">("");
  const vaultFilterSource = ref("");
  /**
   * Narrows the list to one classification from `itemScopeOf`. "" is "Usable
   * here": this campaign, general and library items, but not other campaigns'
   * (a busy multi-campaign account would drown the list in unrelated
   * homebrew). "other_campaign" is the only value that fetches other
   * campaigns' rows at all; it replaced a separate "Show items from all
   * campaigns" checkbox that did the same job.
   */
  const vaultFilterScope = ref<ItemScope | "">("");
  const itemGeneratorOpen = ref(false);

  const vaultHasActiveFilters = computed(() =>
    vaultSearch.value !== "" || vaultFilterType.value !== "" || vaultFilterRarity.value !== "" || vaultFilterSource.value !== "" || vaultFilterScope.value !== "",
  );

  function resetVaultFilters() {
    vaultSearch.value = "";
    vaultFilterType.value = "";
    vaultFilterRarity.value = "";
    vaultFilterSource.value = "";
    vaultFilterScope.value = "";
  }

  return {
    vaultSearch,
    vaultFilterType,
    vaultFilterRarity,
    vaultFilterSource,
    vaultFilterScope,
    vaultHasActiveFilters,
    resetVaultFilters,
    itemGeneratorOpen,
  };
});
