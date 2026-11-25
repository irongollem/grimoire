<template>
  <div class="mx-auto flex w-full min-w-0 max-w-3xl flex-col gap-4" data-chapter="timeline">
    <header class="flex flex-col gap-0.5">
      <h2 class="m-0 text-heading-sm font-bold">{{ chapter.label }}</h2>
      <p class="m-0 text-caption italic text-muted-foreground">{{ chapter.why }}</p>
    </header>
    <CanonBlock title="Add an event">
      <TimelineAddEvent :arc-label="arcLabel" :sort-order="loreCount" />
    </CanonBlock>
    <CanonBlock title="By date in the world">
      <WorldAlmanac />
    </CanonBlock>
  </div>
</template>

<script setup lang="ts">
/** The Timeline chapter (#1279 item 33): the world's dated events in one list, with an event added in place. It was the foot of How the world works, where a storyteller looks for the calendar, not for history. */
import { computed } from "vue";
import { chapterOf } from "@/lib/canon/canonParts";
import { useCanonEntries } from "@/composables/canon/useCanonEntries";
import CanonBlock from "./kit/CanonBlock.vue";
import TimelineAddEvent from "./TimelineAddEvent.vue";
import WorldAlmanac from "./WorldAlmanac.vue";

defineProps<{ arcLabel: string | null }>();

const chapter = chapterOf("timeline");
const { data: entries } = useCanonEntries();
const loreCount = computed(() => (entries.value ?? []).filter((e) => e.part === "lore").length);
</script>
