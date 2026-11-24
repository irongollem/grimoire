<template>
  <CanonRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" layout="flex-col gap-1 sm:flex-row sm:items-start sm:gap-3" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ entry.title }}</span>
    </span>
    <template #mark>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold text-foreground" data-testid="secret-state">
        <span aria-hidden="true">{{ SECRET_STATE_MARK[state] }}</span>
        {{ word }}
      </span>
      <CanonMoveButtons v-if="move" class="pointer-events-auto" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
    </template>
  </CanonRow>
</template>

<script setup lang="ts">
/** One secret in the chapter's list: its words, and at the right a sign and a word, "Revealed" or how many of its clues are found. */
import { computed } from "vue";
import CanonRow from "./kit/CanonRow.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import { SECRET_STATE_MARK, secretState } from "@/lib/canon/canonSecrets";
import type { CanonClue, CanonEntry } from "@/types/canon.types";

const { entry, clues, selected = false, move = null } = defineProps<{
  entry: CanonEntry;
  clues: readonly CanonClue[];
  selected?: boolean;
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{ select: []; move: [direction: -1 | 1] }>();

const state = computed(() => secretState(entry, clues));
const word = computed(() => {
  if (state.value === "revealed") return "Revealed";
  if (clues.length === 0) return "No clues";
  return `${clues.filter((c) => c.found_at !== null).length} of ${clues.length} found`;
});
</script>
