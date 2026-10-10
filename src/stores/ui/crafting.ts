// Workshop (crafting) tabs.
import { defineStore } from "pinia";
import { ref } from "vue";
import type { CraftingDiscipline } from "@/types/crafting.types";

export const useCraftingUiStore = defineStore("ui:crafting", () => {
  // Workshop (Crafting) UI state
  const workshopActiveTab = ref<CraftingDiscipline | "all">("all");
  const playerCraftingActiveTab = ref<CraftingDiscipline | "all">("all");

  return {
    workshopActiveTab,
    playerCraftingActiveTab,
  };
});
