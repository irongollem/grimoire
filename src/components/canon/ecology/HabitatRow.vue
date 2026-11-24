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
    <!-- Above the row's stretched select button, so they stay their own stops. -->
    <span class="relative z-20 flex shrink-0 items-center">
      <AppButton variant="ghost" size="icon-xs" :icon="IconChevronUp" :aria-label="`Move ${habitat.name} up`" :disabled="first" @click="emit('move', -1)" />
      <AppButton variant="ghost" size="icon-xs" :icon="IconChevronDown" :aria-label="`Move ${habitat.name} down`" :disabled="last" @click="emit('move', 1)" />
    </span>
  </CanonRow>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import CanonRow from "../kit/CanonRow.vue";
import { IconChevronDown, IconChevronUp } from "@/lib/icons";
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
