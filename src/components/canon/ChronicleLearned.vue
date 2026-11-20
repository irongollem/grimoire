<template>
  <div v-if="entries.length > 0" class="flex flex-wrap items-center gap-1.5" data-testid="chronicle-learned">
    <span class="mr-1 text-caption text-muted-foreground">What the party learned</span>
    <RouterLink
      v-for="entry in entries"
      :key="entry.key"
      :to="learnedEntryLink(entry)"
      class="inline-flex items-center gap-1 whitespace-nowrap rounded-xs border border-border bg-muted/40 py-px pr-2 pl-0.5 text-label text-foreground hover:bg-accent/40"
    >
      <span class="flex size-4 items-center justify-center rounded-xs bg-secondary text-caption-sm font-bold text-muted-foreground" aria-hidden="true">{{ LETTER[entry.kind] }}</span>
      {{ entry.name }}
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
/** What the party learned in one session, as chips that lead to the person, place, handout, creature or quest. Read-only here; the Sessions page is where it is sorted. */
import { RouterLink } from "vue-router";
import { useSessionLearned } from "@/composables/sessions/useSessionLearned";
import { learnedEntryLink, type LearnedKind } from "@/lib/sessions/learned";

const { sessionId } = defineProps<{ sessionId: string }>();
const { entries } = useSessionLearned(() => sessionId);

const LETTER: Record<LearnedKind, string> = { person: "P", place: "L", handout: "H", creature: "M", quest: "Q", combat: "C" };
</script>
