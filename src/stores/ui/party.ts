// Party page filters: the Packs section's search and chips.
import { defineStore } from "pinia";
import { ref, computed } from "vue";

export const usePartyUiStore = defineStore("ui:party", () => {
  const packsSearch = ref("");
  const packsAttuned = ref(false);
  const packsMagic = ref(false);
  const packsCursed = ref(false);

  const packsHasActiveFilters = computed(
    () => packsSearch.value.trim() !== "" || packsAttuned.value || packsMagic.value || packsCursed.value,
  );

  function resetPacksFilters() {
    packsSearch.value = "";
    packsAttuned.value = false;
    packsMagic.value = false;
    packsCursed.value = false;
  }

  return { packsSearch, packsAttuned, packsMagic, packsCursed, packsHasActiveFilters, resetPacksFilters };
});
