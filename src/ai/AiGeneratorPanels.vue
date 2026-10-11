<template>
  <!--
    Every AI generator panel, mounted together. Each renders nothing visually
    until its own open flag flips (see the `v-if` on each panel's root), so
    mounting the whole set costs nothing at runtime.

    To add a new generator: mount its panel here, register it in its
    useXxxGeneration.ts via registerAiGenerator(), and that's it.
  -->
  <NpcGeneratorPanel v-if="mountedNpcGeneratorPanel" />
  <MonsterGeneratorPanel v-if="mountedMonsterGeneratorPanel" />
  <ItemGeneratorPanel v-if="mountedItemGeneratorPanel" />
  <PuzzleGeneratorPanel v-if="mountedPuzzleGeneratorPanel" />
  <SpellGeneratorPanel v-if="mountedSpellGeneratorPanel" />
  <QuestGeneratorPanel v-if="mountedQuestGeneratorPanel" />
  <TrapGeneratorPanel v-if="mountedTrapGeneratorPanel" />
  <FactionGeneratorPanel v-if="mountedFactionGeneratorPanel" />
  <LocationGeneratorPanel v-if="mountedLocationGeneratorPanel" />
  <RollTableGeneratorPanel v-if="mountedRollTableGeneratorPanel" />
  <LootTableGeneratorPanel v-if="mountedLootTableGeneratorPanel" />
  <EncounterGeneratorPanel v-if="mountedEncounterGeneratorPanel" />
  <DungeonFeatureGeneratorPanel v-if="mountedDungeonFeatureGeneratorPanel" />
  <CustomRuleGeneratorPanel v-if="mountedCustomRuleGeneratorPanel" />
  <DeityGeneratorPanel v-if="mountedDeityGeneratorPanel" />
  <SpeciesGeneratorPanel v-if="mountedSpeciesGeneratorPanel" />
  <BackgroundGeneratorPanel v-if="mountedBackgroundGeneratorPanel" />
  <RecipeGeneratorPanel v-if="mountedRecipeGeneratorPanel" />
  <CustomClassGeneratorPanel v-if="mountedCustomClassGeneratorPanel" />
  <CustomSubclassGeneratorPanel v-if="mountedCustomSubclassGeneratorPanel" />
  <ClassFeatureGeneratorPanel v-if="mountedClassFeatureGeneratorPanel" />
  <ScriptoriumDraftDialog v-if="mountedScriptoriumDraftDialog" :open="generatorsUi.scriptoriumDraftOpen" @close="generatorsUi.scriptoriumDraftOpen = false" />
  <!-- Add Sound hosts music generation (useMusicGeneration). -->
  <AddSoundDialog v-if="mountedAddSoundDialog" />
</template>

<script setup lang="ts">
// This host is mounted at boot (see DefaultLayout.vue) and must stay cheap:
// every panel is its own async chunk, fetched the first time its flag opens, so
// the panels' closure (Tiptap, the discipline tables, the generation
// composables) never rides along on a page that does not use one. Nothing
// heavy may be imported statically here.
import { defineAsyncComponent, type Component } from "vue";
import GeneratorPanelLoading from "@/components/common/ai/GeneratorPanelLoading.vue";
import { useGeneratorUiStore } from "@/stores/ui/generators";
import { useItemsUiStore } from "@/stores/ui/items";
import { useMonstersUiStore } from "@/stores/ui/monsters";
import { useNpcsUiStore } from "@/stores/ui/npcs";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { useSpellsUiStore } from "@/stores/ui/spells";
import { storeToRefs } from "pinia";
import { useLazyMount } from "@/composables/useLazyMount";

// The delay keeps a fast load invisible. Registration in the AI generator
// registry happens when a panel's generation module evaluates, i.e. on first
// open; the registry is reactive, so the badge and analytics pick entries up
// as they arrive and nothing can be generating before a panel has opened.
function lazyPanel<T extends Component>(loader: () => Promise<T>) {
  return defineAsyncComponent({ loader, loadingComponent: GeneratorPanelLoading, delay: 200 });
}

const NpcGeneratorPanel = lazyPanel(() => import("@/components/npcs/NpcGeneratorPanel.vue"));
const MonsterGeneratorPanel = lazyPanel(() => import("@/components/monsters/MonsterGeneratorPanel.vue"));
const ItemGeneratorPanel = lazyPanel(() => import("@/components/items/ItemGeneratorPanel.vue"));
const PuzzleGeneratorPanel = lazyPanel(() => import("@/components/puzzles/PuzzleGeneratorPanel.vue"));
const SpellGeneratorPanel = lazyPanel(() => import("@/components/spells/SpellGeneratorPanel.vue"));
const QuestGeneratorPanel = lazyPanel(() => import("@/components/quests/overview/QuestGeneratorPanel.vue"));
const TrapGeneratorPanel = lazyPanel(() => import("@/components/traps/TrapGeneratorPanel.vue"));
const FactionGeneratorPanel = lazyPanel(() => import("@/components/factions/FactionGeneratorPanel.vue"));
const LocationGeneratorPanel = lazyPanel(() => import("@/components/locations/place/LocationGeneratorPanel.vue"));
const RollTableGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/RollTableGeneratorPanel.vue"));
const LootTableGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/LootTableGeneratorPanel.vue"));
const EncounterGeneratorPanel = lazyPanel(() => import("@/components/encounters/EncounterGeneratorPanel.vue"));
const DungeonFeatureGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/DungeonFeatureGeneratorPanel.vue"));
const CustomRuleGeneratorPanel = lazyPanel(() => import("@/components/rules/CustomRuleGeneratorPanel.vue"));
const DeityGeneratorPanel = lazyPanel(() => import("@/components/deities/DeityGeneratorPanel.vue"));
const SpeciesGeneratorPanel = lazyPanel(() => import("@/components/species/SpeciesGeneratorPanel.vue"));
const BackgroundGeneratorPanel = lazyPanel(() => import("@/components/backgrounds/BackgroundGeneratorPanel.vue"));
const RecipeGeneratorPanel = lazyPanel(() => import("@/components/crafting/RecipeGeneratorPanel.vue"));
const CustomClassGeneratorPanel = lazyPanel(() => import("@/components/levelup/CustomClassGeneratorPanel.vue"));
const CustomSubclassGeneratorPanel = lazyPanel(() => import("@/components/levelup/CustomSubclassGeneratorPanel.vue"));
const ClassFeatureGeneratorPanel = lazyPanel(() => import("@/components/features/ClassFeatureGeneratorPanel.vue"));
const ScriptoriumDraftDialog = lazyPanel(() => import("@/components/scriptorium/ScriptoriumDraftDialog.vue"));
const AddSoundDialog = lazyPanel(() => import("@/components/soundboard/AddSoundDialog.vue"));

const generatorsUi = useGeneratorUiStore();
const itemsUi = useItemsUiStore();
const monstersUi = useMonstersUiStore();
const npcsUi = useNpcsUiStore();
const puzzlesUi = usePuzzlesUiStore();
const questsUi = useQuestsUiStore();
const soundboardUi = useSoundboardUiStore();
const spellsUi = useSpellsUiStore();
// A panel mounts the first time its flag opens and stays mounted: its setup
// pulls credits, provider config, party and library reads that a closed panel
// has no use for (22 of them ran at boot), while a dismissed generation lives
// in the panel's own generateAndCreate and must outlive the panel closing.
const { npcGeneratorOpen } = storeToRefs(npcsUi);
const { monsterGeneratorOpen } = storeToRefs(monstersUi);
const { itemGeneratorOpen } = storeToRefs(itemsUi);
const { puzzleGeneratorOpen } = storeToRefs(puzzlesUi);
const { spellGeneratorOpen } = storeToRefs(spellsUi);
const { questGeneratorOpen } = storeToRefs(questsUi);
const { trapGeneratorOpen, factionGeneratorOpen, locationGeneratorOpen, rollTableGeneratorOpen, lootTableGeneratorOpen, encounterGeneratorOpen, dungeonFeatureGeneratorOpen, customRuleGeneratorOpen, deityGeneratorOpen, speciesGeneratorOpen, backgroundGeneratorOpen, recipeGeneratorOpen, customClassGeneratorOpen, customSubclassGeneratorOpen, classFeatureGeneratorOpen, scriptoriumDraftOpen } = storeToRefs(generatorsUi);
const { addSoundDialogOpen } = storeToRefs(soundboardUi);
const mountedNpcGeneratorPanel = useLazyMount(npcGeneratorOpen);
const mountedMonsterGeneratorPanel = useLazyMount(monsterGeneratorOpen);
const mountedItemGeneratorPanel = useLazyMount(itemGeneratorOpen);
const mountedPuzzleGeneratorPanel = useLazyMount(puzzleGeneratorOpen);
const mountedSpellGeneratorPanel = useLazyMount(spellGeneratorOpen);
const mountedQuestGeneratorPanel = useLazyMount(questGeneratorOpen);
const mountedTrapGeneratorPanel = useLazyMount(trapGeneratorOpen);
const mountedFactionGeneratorPanel = useLazyMount(factionGeneratorOpen);
const mountedLocationGeneratorPanel = useLazyMount(locationGeneratorOpen);
const mountedRollTableGeneratorPanel = useLazyMount(rollTableGeneratorOpen);
const mountedLootTableGeneratorPanel = useLazyMount(lootTableGeneratorOpen);
const mountedEncounterGeneratorPanel = useLazyMount(encounterGeneratorOpen);
const mountedDungeonFeatureGeneratorPanel = useLazyMount(dungeonFeatureGeneratorOpen);
const mountedCustomRuleGeneratorPanel = useLazyMount(customRuleGeneratorOpen);
const mountedDeityGeneratorPanel = useLazyMount(deityGeneratorOpen);
const mountedSpeciesGeneratorPanel = useLazyMount(speciesGeneratorOpen);
const mountedBackgroundGeneratorPanel = useLazyMount(backgroundGeneratorOpen);
const mountedRecipeGeneratorPanel = useLazyMount(recipeGeneratorOpen);
const mountedCustomClassGeneratorPanel = useLazyMount(customClassGeneratorOpen);
const mountedCustomSubclassGeneratorPanel = useLazyMount(customSubclassGeneratorOpen);
const mountedClassFeatureGeneratorPanel = useLazyMount(classFeatureGeneratorOpen);
const mountedScriptoriumDraftDialog = useLazyMount(scriptoriumDraftOpen);
const mountedAddSoundDialog = useLazyMount(addSoundDialogOpen);

</script>
