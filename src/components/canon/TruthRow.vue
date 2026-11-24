<template>
  <CanonLedgerRow :id="`canon-entry-${entry.id}`" :label="entry.title" :selected="selected" layout="flex-col gap-1 sm:flex-row sm:items-start sm:gap-3" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="block text-body leading-snug text-foreground">{{ entry.title }}</span>
      <span v-if="entry.knowledge === 'some'" class="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-label text-muted-foreground">
        <template v-if="knowers.length > 0">
          Known to
          <CanonRef v-for="k in knowers" :key="k.rowId" :kind="k.kind" :name="k.name" />
        </template>
        <span v-else data-testid="nobody-named" class="italic">Nobody named yet: say who knows it.</span>
      </span>
    </span>
    <CanonKnowledgeMark v-if="entry.knowledge" :mark="entry.knowledge" class="sm:mt-0.5" />
    <CanonMoveButtons v-if="move" :label="entry.title" :first="move.first" :last="move.last" @move="(d) => emit('move', d)" />
  </CanonLedgerRow>
</template>

<script setup lang="ts">
import CanonLedgerRow from "./CanonLedgerRow.vue";
import CanonKnowledgeMark from "./CanonKnowledgeMark.vue";
import CanonMoveButtons from "./CanonMoveButtons.vue";
import CanonRef from "./CanonRef.vue";
import type { Knower } from "@/composables/canon/useKnownToByEntry";
import type { CanonEntry } from "@/types/canon.types";

const { entry, selected = false, knowers, move = null } = defineProps<{
  entry: CanonEntry;
  selected?: boolean;
  /** Who knows it, read once for the whole list by the section. */
  knowers: readonly Knower[];
  /** Up and down, offered only while nothing narrows the list; `null` hides them. */
  move?: { first: boolean; last: boolean } | null;
}>();
const emit = defineEmits<{ select: []; move: [direction: -1 | 1] }>();
</script>
