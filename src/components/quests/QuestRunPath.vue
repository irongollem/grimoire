<template>
  <details class="rounded-xl border border-border bg-card p-3">
    <summary class="cursor-pointer font-cinzel text-sm font-bold text-foreground">Path so far · {{ visits.length }} move{{ visits.length === 1 ? '' : 's' }}</summary>
    <ol class="mt-3 space-y-2 border-l border-border pl-3">
      <li v-for="visit in visits" :key="visit.id" class="text-caption" :class="visit.kind === 'assert' ? 'border-l-2 -ml-3 border-tone-caution pl-2.5' : ''">
        <span class="font-semibold text-foreground">{{ visit.toBeat || "Session ended" }}</span>
        <span v-if="visit.toQuest" class="text-muted-foreground"> · {{ visit.toQuest }}</span>
        <!-- `assert` (#796) is a DM recording history, not a move the party
             made — tinted apart from every played kind so the log stays
             honest about which rows happened at the table and which were
             backfilled afterward. -->
        <span
          class="ml-2 rounded px-1.5 py-0.5 text-label uppercase"
          :class="visit.kind === 'assert' ? 'bg-tone-caution/15 text-tone-caution' : 'bg-muted text-muted-foreground'"
        >{{ visit.kind === "assert" ? "Recorded" : visit.kind }}</span>
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
