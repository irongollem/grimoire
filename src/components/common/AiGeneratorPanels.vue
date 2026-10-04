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
  <ScriptoriumDraftDialog v-if="mountedScriptoriumDraftDialog" :open="ui.scriptoriumDraftOpen" @close="ui.scriptoriumDraftOpen = false" />
  <!-- Add Sound hosts music generation (useMusicGeneration). -->
  <AddSoundDialog v-if="mountedAddSoundDialog" />
</template>

<script setup lang="ts">
// Grouped into one component so DefaultLayout can pull the whole cluster in a
// single async import — a defineAsyncComponent per panel would splinter it into
// a chunk each, and they all load at the same moment anyway. See the comment at
// the import site in DefaultLayout.vue for why this is deferred at all.
import NpcGeneratorPanel from "@/components/npcs/NpcGeneratorPanel.vue";
import MonsterGeneratorPanel from "@/components/monsters/MonsterGeneratorPanel.vue";
import ItemGeneratorPanel from "@/components/items/ItemGeneratorPanel.vue";
import PuzzleGeneratorPanel from "@/components/puzzles/PuzzleGeneratorPanel.vue";
import SpellGeneratorPanel from "@/components/spells/SpellGeneratorPanel.vue";
import QuestGeneratorPanel from "@/components/quests/QuestGeneratorPanel.vue";
import TrapGeneratorPanel from "@/components/traps/TrapGeneratorPanel.vue";
import FactionGeneratorPanel from "@/components/factions/FactionGeneratorPanel.vue";
import LocationGeneratorPanel from "@/components/locations/LocationGeneratorPanel.vue";
import RollTableGeneratorPanel from "@/components/dungeon-features/RollTableGeneratorPanel.vue";
import LootTableGeneratorPanel from "@/components/dungeon-features/LootTableGeneratorPanel.vue";
import EncounterGeneratorPanel from "@/components/encounters/EncounterGeneratorPanel.vue";
import DungeonFeatureGeneratorPanel from "@/components/dungeon-features/DungeonFeatureGeneratorPanel.vue";
import CustomRuleGeneratorPanel from "@/components/rules/CustomRuleGeneratorPanel.vue";
import DeityGeneratorPanel from "@/components/deities/DeityGeneratorPanel.vue";
import SpeciesGeneratorPanel from "@/components/species/SpeciesGeneratorPanel.vue";
import BackgroundGeneratorPanel from "@/components/backgrounds/BackgroundGeneratorPanel.vue";
import RecipeGeneratorPanel from "@/components/crafting/RecipeGeneratorPanel.vue";
import CustomClassGeneratorPanel from "@/components/levelup/CustomClassGeneratorPanel.vue";
import CustomSubclassGeneratorPanel from "@/components/levelup/CustomSubclassGeneratorPanel.vue";
import ClassFeatureGeneratorPanel from "@/components/features/ClassFeatureGeneratorPanel.vue";
import ScriptoriumDraftDialog from "@/components/scriptorium/ScriptoriumDraftDialog.vue";
import { useUiStore } from "@/stores/ui";

import AddSoundDialog from "@/components/soundboard/AddSoundDialog.vue";
import { storeToRefs } from "pinia";
import { useLazyMount } from "@/composables/useLazyMount";

const ui = useUiStore();
// A panel mounts the first time its flag opens and stays mounted: its setup
// pulls credits, provider config, party and library reads that a closed panel
// has no use for (22 of them ran at boot), while a dismissed generation lives
// in the panel's own generateAndCreate and must outlive the panel closing.
const { npcGeneratorOpen, monsterGeneratorOpen, itemGeneratorOpen, puzzleGeneratorOpen, spellGeneratorOpen, questGeneratorOpen, trapGeneratorOpen, factionGeneratorOpen, locationGeneratorOpen, rollTableGeneratorOpen, lootTableGeneratorOpen, encounterGeneratorOpen, dungeonFeatureGeneratorOpen, customRuleGeneratorOpen, deityGeneratorOpen, speciesGeneratorOpen, backgroundGeneratorOpen, recipeGeneratorOpen, customClassGeneratorOpen, customSubclassGeneratorOpen, classFeatureGeneratorOpen, scriptoriumDraftOpen, addSoundDialogOpen } = storeToRefs(ui);
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
