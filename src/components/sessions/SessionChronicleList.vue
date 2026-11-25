<template>
  <div v-if="rows.length > 0" class="flex flex-col gap-1.5" data-testid="chronicle-session-list">
    <span class="text-eyebrow text-muted-foreground">This session</span>
    <ul class="m-0 flex list-none flex-col gap-1 p-0">
      <li v-for="row in rows" :key="row.key" class="flex min-w-0 items-baseline gap-2" data-testid="chronicle-session-row">
        <span class="w-24 shrink-0 text-caption text-muted-foreground" data-testid="chronicle-session-kind">{{ row.word }}</span>
        <RouterLink :to="row.to" class="min-w-0 text-body text-foreground hover:underline">{{ row.title }}</RouterLink>
      </li>
    </ul>
  </div>
</template>

<script setup lang="ts">
/**
 * One list of what a session did (#1279 item 31): what the party learned, what the canon was told, revealed and found,
 * and the table's lines still waiting for review, each row with a word for its kind. It replaces "What the party
 * learned" and "Canon this session", which said the same evening twice. Read-only; the Sessions page is where learned
 * moments are sorted and the Truths chapter is where table lines are reviewed.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import type { SessionCanon } from "@/lib/canon/canonSession";
import { learnedEntryLink, type LearnedEntry } from "@/lib/sessions/learned";

const { learned, canon } = defineProps<{ learned: readonly LearnedEntry[]; canon: SessionCanon }>();

interface Row { key: string; title: string; word: string; to: { path: string; query?: Record<string, string> } }
/** What the party learned comes first, then the canon's own rows in their order. */
const rows = computed<Row[]>(() => [
  ...learned.map((e): Row => ({ key: `learned:${e.key}`, title: e.name, word: "Learned", to: learnedEntryLink(e) })),
  ...canon.rows,
]);
</script>
