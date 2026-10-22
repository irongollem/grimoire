// Family tree toggles: who is drawn around the centred person.
import { defineStore } from "pinia";
import { computed, ref } from "vue";

export const useFamilyUiStore = defineStore("ui:family", () => {
  // All three default on, so "active" means one has been switched off.
  const familyShowDead = ref(true);
  const familyShowMarriedIn = ref(true);
  const familyShowPcs = ref(true);

  const familyHasActiveFilters = computed(
    () => !familyShowDead.value || !familyShowMarriedIn.value || !familyShowPcs.value,
  );

  function resetFamilyFilters() {
    familyShowDead.value = true;
    familyShowMarriedIn.value = true;
    familyShowPcs.value = true;
  }

  return { familyShowDead, familyShowMarriedIn, familyShowPcs, familyHasActiveFilters, resetFamilyFilters };
});
