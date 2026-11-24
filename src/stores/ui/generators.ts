// Open flags for the app-wide AI generator panels (mounted in AiGeneratorPanels). The list-page generators for NPCs, monsters, items, spells, puzzles and quests keep their flag in their own domain store.
import { defineStore } from "pinia";
import { ref } from "vue";

export const useGeneratorUiStore = defineStore("ui:generators", () => {
  // Trap generator
  const trapGeneratorOpen = ref(false);

  // Faction generator

  // Epic #910 generators: one sidebar panel each, mounted in AiGeneratorPanels.
  const dungeonFeatureGeneratorOpen = ref(false);
  const customClassGeneratorOpen = ref(false);
  const customSubclassGeneratorOpen = ref(false);
  const recipeGeneratorOpen = ref(false);

  // Location generator

  // Roll table generator
  const rollTableGeneratorOpen = ref(false);

  // Loot table generator
  const lootTableGeneratorOpen = ref(false);

  return {
    trapGeneratorOpen,
    dungeonFeatureGeneratorOpen,
    customClassGeneratorOpen,
    customSubclassGeneratorOpen,
    recipeGeneratorOpen,
    rollTableGeneratorOpen,
    lootTableGeneratorOpen,
  };
});
