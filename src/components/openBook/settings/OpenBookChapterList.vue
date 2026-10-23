<template>
  <div class="max-w-xl">
    <div v-for="row in ROWS" :key="row.id" class="flex items-center justify-between gap-4 border-b border-border py-1.5">
      <AppCheckbox v-model="chapters" :value="row.id" :label="row.label" class="flex-1" />
      <span class="shrink-0 text-caption text-muted-foreground">{{ row.count(stats) }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import type { OpenBookChapter, OpenBookStats } from "@/types/openBook.types";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";

const chapters = defineModel<OpenBookChapter[]>({ required: true });

/** Counts of what a release made now would hold, or null while they load. */
defineProps<{ stats: OpenBookStats | null }>();

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

const ROWS: { id: OpenBookChapter; label: string; count: (s: OpenBookStats | null) => string }[] = [
  { id: "atlas", label: "The Atlas", count: (s) => (s ? plural(s.places, "place", "places") : "") },
  { id: "folk", label: "Folk", count: (s) => (s ? plural(s.folk, "person", "people") : "") },
  { id: "factions", label: "Factions and Houses", count: (s) => (s ? plural(s.factions, "faction", "factions") : "") },
  { id: "pantheon", label: "The Pantheon", count: (s) => (s ? plural(s.deities, "deity", "deities") : "") },
  { id: "lore", label: "Lore and Legend", count: (s) => (s ? plural(s.lore, "note", "notes") : "") },
  {
    id: "chronicle",
    label: "The Chronicle",
    count: (s) => (s ? `Calendar and ${plural(s.sessions, "session recap", "session recaps")}` : "Calendar and session recaps"),
  },
];
</script>
