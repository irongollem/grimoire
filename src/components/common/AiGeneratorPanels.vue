<template>
  <!--
    Every AI generator panel, mounted together. Each renders nothing visually
    until its own open flag flips (see the `v-if` on each panel's root), so
    mounting the whole set costs nothing at runtime.

    To add a new generator: mount its panel here, register it in its
    useXxxGeneration.ts via registerAiGenerator(), and that's it.
  -->
  <NpcGeneratorPanel />
  <MonsterGeneratorPanel />
  <ItemGeneratorPanel />
  <PuzzleGeneratorPanel />
  <SpellGeneratorPanel />
  <QuestGeneratorPanel />
  <TrapGeneratorPanel />
  <FactionGeneratorPanel />
  <LocationGeneratorPanel />
  <RollTableGeneratorPanel />
  <LootTableGeneratorPanel />
  <EncounterGeneratorPanel />
  <DungeonFeatureGeneratorPanel />
  <CustomRuleGeneratorPanel />
  <DeityGeneratorPanel />
  <SpeciesGeneratorPanel />
  <BackgroundGeneratorPanel />
  <RecipeGeneratorPanel />
  <CustomClassGeneratorPanel />
  <CustomSubclassGeneratorPanel />
  <ClassFeatureGeneratorPanel />
  <ScriptoriumDraftDialog :open="ui.scriptoriumDraftOpen" @close="ui.scriptoriumDraftOpen = false" />
  <!-- Add Sound hosts music generation (useMusicGeneration). -->
  <AddSoundDialog />
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

const ui = useUiStore();
import AddSoundDialog from "@/components/soundboard/AddSoundDialog.vue";
</script>
