<template>
  <details class="rounded-xl border border-border bg-card p-3">
    <summary class="cursor-pointer font-cinzel text-sm font-bold text-foreground">Path so far · {{ visits.length }} move{{ visits.length === 1 ? '' : 's' }}</summary>
    <ol class="mt-3 space-y-2 border-l border-border pl-3">
      <li v-for="visit in visits" :key="visit.id" class="text-caption">
        <span class="font-semibold text-foreground">{{ visit.toBeat || "Session ended" }}</span>
        <span v-if="visit.toQuest" class="text-muted-foreground"> · {{ visit.toQuest }}</span>
        <span class="ml-2 rounded bg-muted px-1.5 py-0.5 text-label uppercase text-muted-foreground">{{ visit.kind }}</span>
        <p v-if="visit.reason" class="text-muted-foreground">{{ visit.reason }}</p>
      </li>
    </ol>
  </details>
</template>

<script setup lang="ts">
import { computed } from "vue";

const props = defineProps<{ path: Array<Record<string, unknown>> }>();
const visits = computed(() => props.path.map((row, index) => ({
  id: String(row.id ?? index),
  kind: String(row.kind ?? "visit"),
  toBeat: row.to_beat_title ? String(row.to_beat_title) : "",
  toQuest: row.to_quest_title ? String(row.to_quest_title) : "",
  reason: row.reason ? String(row.reason) : "",
})));
</script>
