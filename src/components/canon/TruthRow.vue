<template>
  <li
    :id="`canon-entry-${entry.id}`"
    class="relative flex min-w-0 flex-col gap-1 border-b border-border px-4 py-3 transition-colors last:border-b-0 hover:bg-accent/40 sm:flex-row sm:items-start sm:gap-3"
    :class="selected ? 'bg-primary/10 shadow-[inset_2px_0_0_var(--primary)]' : ''"
    :data-selected="selected"
  >
    <!-- A bare button stretched over the row: all the chrome is on the <li>, and the row stays one keyboard stop. -->
    <button
      type="button"
      class="absolute inset-0 z-10 cursor-pointer focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
      :aria-pressed="selected"
      :aria-label="entry.title"
      @click="emit('select')"
    />
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
  </li>
</template>

<script setup lang="ts">
import CanonKnowledgeMark from "./CanonKnowledgeMark.vue";
import CanonRef from "./CanonRef.vue";
import type { Knower } from "@/composables/canon/useKnownToByEntry";
import type { CanonEntry } from "@/types/canon.types";

const { entry, selected = false, knowers } = defineProps<{
  entry: CanonEntry;
  selected?: boolean;
  /** Who knows it, read once for the whole list by the section. */
  knowers: readonly Knower[];
}>();
const emit = defineEmits<{ select: [] }>();
</script>
