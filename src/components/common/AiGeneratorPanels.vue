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
  <EncounterGeneratorPanel />
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
import EncounterGeneratorPanel from "@/components/encounters/EncounterGeneratorPanel.vue";
</script>
