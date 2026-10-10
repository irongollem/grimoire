// Open flags for the app-wide AI generator panels (mounted in AiGeneratorPanels). The list-page generators for NPCs, monsters, items, spells, puzzles and quests keep their flag in their own domain store.
import { defineStore } from "pinia";
import { ref } from "vue";

export const useGeneratorUiStore = defineStore("ui:generators", () => {
  // Trap generator
  const trapGeneratorOpen = ref(false);

  // Faction generator
  const factionGeneratorOpen = ref(false);

  // Epic #910 generators: one sidebar panel each, mounted in AiGeneratorPanels.
  const dungeonFeatureGeneratorOpen = ref(false);
  const deityGeneratorOpen = ref(false);
  const speciesGeneratorOpen = ref(false);
  const backgroundGeneratorOpen = ref(false);
  const customClassGeneratorOpen = ref(false);
  const customSubclassGeneratorOpen = ref(false);
  const classFeatureGeneratorOpen = ref(false);
  const customRuleGeneratorOpen = ref(false);
  const recipeGeneratorOpen = ref(false);
  // The Scriptorium "Draft with AI" dialog (mounted by ScriptoriumView and TemplateGallery).
  const scriptoriumDraftOpen = ref(false);

  // Location generator
  const locationGeneratorOpen = ref(false);

  // Roll table generator
  const rollTableGeneratorOpen = ref(false);

  // Loot table generator
  const lootTableGeneratorOpen = ref(false);

  // Encounter generator
  const encounterGeneratorOpen = ref(false);

  return {
    trapGeneratorOpen,
    factionGeneratorOpen,
    dungeonFeatureGeneratorOpen,
    deityGeneratorOpen,
    speciesGeneratorOpen,
    backgroundGeneratorOpen,
    customClassGeneratorOpen,
    customSubclassGeneratorOpen,
    classFeatureGeneratorOpen,
    customRuleGeneratorOpen,
    recipeGeneratorOpen,
    scriptoriumDraftOpen,
    locationGeneratorOpen,
    rollTableGeneratorOpen,
    lootTableGeneratorOpen,
    encounterGeneratorOpen,
  };
});
