<template>
  <div v-if="isLoading" class="flex justify-center py-12">
    <LoadingSpinner />
  </div>
  <div v-else-if="!puzzles.length" class="text-center py-12">
    <IconPuzzle class="h-10 w-10 text-muted-foreground/40 mx-auto mb-3" />
    <p class="font-fell text-muted-foreground italic">No puzzles shared by your DM yet.</p>
  </div>
  <div v-else class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <RouterLink
      v-for="puzzle in puzzles"
      :key="puzzle.id"
      :to="`/play/puzzles/${puzzle.id}`"
      class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
    >
      <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
        <FocalImage
          :src="puzzle.image_url"
          :alt="puzzle.name"
          format="portrait"
          :focal-point="puzzle.image_focal_point"
          placeholder="/assets/placeholders/enigma.webp"
          class="group-hover:scale-105 transition-transform duration-300"
        />
        <span
          class="absolute top-2 left-2 font-cinzel text-2xs px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
          :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
        >{{ puzzle.puzzle_type }}</span>
        <span
          class="absolute bottom-2 right-2 font-cinzel text-2xs px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
          :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
        >{{ puzzle.difficulty }}</span>
      </div>
      <div class="p-2.5">
        <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
        <p v-if="puzzle.shared_hints.length" class="font-fell text-2xs text-primary mt-0.5">
          {{ puzzle.shared_hints.length }} hint{{ puzzle.shared_hints.length === 1 ? '' : 's' }} available
        </p>
      </div>
    </RouterLink>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from 'vue-router';
import { IconPuzzle } from '@/lib/icons';
import FocalImage from '@/components/common/FocalImage.vue';
import LoadingSpinner from '@/components/common/LoadingSpinner.vue';
import { PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from '@/types/puzzle.types';
import type { PuzzleRoom } from '@/types/puzzle.types';

defineProps<{
  isLoading: boolean;
  puzzles: PuzzleRoom[];
}>();
</script>
