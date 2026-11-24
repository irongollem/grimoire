<template>
  <CanonRow :id="`canon-habitat-${habitat.id}`" :label="habitat.name" :selected="selected" layout="flex-row items-start gap-3" @select="emit('select')">
    <span class="min-w-0 flex-1">
      <span class="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span class="text-body font-bold leading-snug text-foreground">{{ habitat.name }}</span>
        <span v-for="place in places" :key="place" class="text-label text-muted-foreground" data-testid="habitat-place">{{ place }}</span>
      </span>
      <span v-if="summary" class="mt-1 block text-caption text-muted-foreground" data-testid="habitat-summary">{{ summary }}</span>
      <span v-else class="mt-1 block text-caption italic text-muted-foreground">Nothing lives here yet.</span>
    </span>
    <template #mark>
      <span class="inline-flex items-center gap-1.5 whitespace-nowrap text-label font-bold text-foreground" data-testid="habitat-mark">
        <IconLocation class="size-3.5 shrink-0" aria-hidden="true" />
        {{ places.length === 0 ? "No places" : places.length === 1 ? "1 place" : `${places.length} places` }}
      </span>
      <CanonMoveButtons class="pointer-events-auto" :label="habitat.name" :first="first" :last="last" @move="(by) => emit('move', by)" />
    </template>
  </CanonRow>
</template>

<script setup lang="ts">
import CanonMoveButtons from "../CanonMoveButtons.vue";
import CanonRow from "../kit/CanonRow.vue";
import { IconLocation } from "@/lib/icons";
import type { Habitat } from "@/lib/canon/habitats";

defineProps<{
  habitat: Habitat;
  /** The names of the Atlas places it covers. */
  places: readonly string[];
  /** What lives there, in words ("Marsh eel 40%, anything else 60%"); "" when nothing is listed. */
  summary: string;
  selected: boolean;
  first: boolean;
  last: boolean;
}>();
const emit = defineEmits<{ select: []; move: [by: -1 | 1] }>();
</script>
