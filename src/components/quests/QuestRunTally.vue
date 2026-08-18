<template>
  <p v-if="total" class="flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted-foreground" aria-label="Story flow progress">
    <span v-if="tally.visited"><strong class="font-semibold text-foreground">{{ tally.visited }}</strong> played</span>
    <span v-if="tally.ahead"><strong class="font-semibold text-foreground">{{ tally.ahead }}</strong> still ahead</span>
    <!-- Cut off is the one the DM cannot see on the graph, so it is the one that
         gets a colour: prepared beats the run has walked past for good. -->
    <span v-if="tally.stranded" class="text-tone-caution"><strong class="font-semibold">{{ tally.stranded }}</strong> cut off</span>
  </p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import type { QuestReachTally } from "@/lib/quests/presentation";

const { tally } = defineProps<{ tally: QuestReachTally }>();
const total = computed(() => tally.visited + tally.ahead + tally.stranded);
</script>
