<template>
  <!--
    Every AI generator panel, mounted together. Each renders nothing visually
    until its own open flag flips (see the `v-if` on each panel's root), so
    mounting the whole set costs nothing at runtime.

    To add a new generator: mount its panel here, register it in its
    useXxxGeneration.ts via registerAiGenerator(), and that's it.
  -->
  <PuzzleGeneratorPanel v-if="mountedPuzzleGeneratorPanel" />
  <QuestGeneratorPanel v-if="mountedQuestGeneratorPanel" />
  <TrapGeneratorPanel v-if="mountedTrapGeneratorPanel" />
  <RollTableGeneratorPanel v-if="mountedRollTableGeneratorPanel" />
  <LootTableGeneratorPanel v-if="mountedLootTableGeneratorPanel" />
  <DungeonFeatureGeneratorPanel v-if="mountedDungeonFeatureGeneratorPanel" />
  <RecipeGeneratorPanel v-if="mountedRecipeGeneratorPanel" />
  <CustomClassGeneratorPanel v-if="mountedCustomClassGeneratorPanel" />
  <CustomSubclassGeneratorPanel v-if="mountedCustomSubclassGeneratorPanel" />
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
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import { useQuestsUiStore } from "@/stores/ui/quests";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import { storeToRefs } from "pinia";
import { useLazyMount } from "@/composables/useLazyMount";

// The delay keeps a fast load invisible. Registration in the AI generator
// registry happens when a panel's generation module evaluates, i.e. on first
// open; the registry is reactive, so the badge and analytics pick entries up
// as they arrive and nothing can be generating before a panel has opened.
function lazyPanel<T extends Component>(loader: () => Promise<T>) {
  return defineAsyncComponent({ loader, loadingComponent: GeneratorPanelLoading, delay: 200 });
}

const PuzzleGeneratorPanel = lazyPanel(() => import("@/components/puzzles/PuzzleGeneratorPanel.vue"));
const QuestGeneratorPanel = lazyPanel(() => import("@/components/quests/overview/QuestGeneratorPanel.vue"));
const TrapGeneratorPanel = lazyPanel(() => import("@/components/traps/TrapGeneratorPanel.vue"));
const RollTableGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/RollTableGeneratorPanel.vue"));
const LootTableGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/LootTableGeneratorPanel.vue"));
const DungeonFeatureGeneratorPanel = lazyPanel(() => import("@/components/dungeon-features/DungeonFeatureGeneratorPanel.vue"));
const RecipeGeneratorPanel = lazyPanel(() => import("@/components/crafting/RecipeGeneratorPanel.vue"));
const CustomClassGeneratorPanel = lazyPanel(() => import("@/components/levelup/CustomClassGeneratorPanel.vue"));
const CustomSubclassGeneratorPanel = lazyPanel(() => import("@/components/levelup/CustomSubclassGeneratorPanel.vue"));
const AddSoundDialog = lazyPanel(() => import("@/components/soundboard/AddSoundDialog.vue"));

const generatorsUi = useGeneratorUiStore();
const puzzlesUi = usePuzzlesUiStore();
const questsUi = useQuestsUiStore();
const soundboardUi = useSoundboardUiStore();
// A panel mounts the first time its flag opens and stays mounted: its setup
// pulls credits, provider config, party and library reads that a closed panel
// has no use for (22 of them ran at boot), while a dismissed generation lives
// in the panel's own generateAndCreate and must outlive the panel closing.
const { puzzleGeneratorOpen } = storeToRefs(puzzlesUi);
const { questGeneratorOpen } = storeToRefs(questsUi);
const { trapGeneratorOpen, rollTableGeneratorOpen, lootTableGeneratorOpen, dungeonFeatureGeneratorOpen, recipeGeneratorOpen, customClassGeneratorOpen, customSubclassGeneratorOpen } = storeToRefs(generatorsUi);
const { addSoundDialogOpen } = storeToRefs(soundboardUi);
const mountedPuzzleGeneratorPanel = useLazyMount(puzzleGeneratorOpen);
const mountedQuestGeneratorPanel = useLazyMount(questGeneratorOpen);
const mountedTrapGeneratorPanel = useLazyMount(trapGeneratorOpen);
const mountedRollTableGeneratorPanel = useLazyMount(rollTableGeneratorOpen);
const mountedLootTableGeneratorPanel = useLazyMount(lootTableGeneratorOpen);
const mountedDungeonFeatureGeneratorPanel = useLazyMount(dungeonFeatureGeneratorOpen);
const mountedRecipeGeneratorPanel = useLazyMount(recipeGeneratorOpen);
const mountedCustomClassGeneratorPanel = useLazyMount(customClassGeneratorOpen);
const mountedCustomSubclassGeneratorPanel = useLazyMount(customSubclassGeneratorOpen);
const mountedAddSoundDialog = useLazyMount(addSoundDialogOpen);

</script>
