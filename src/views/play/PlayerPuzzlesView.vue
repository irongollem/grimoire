<template>
  <div class="space-y-4">
    <h2 class="font-cinzel text-lg font-bold text-foreground">Puzzles</h2>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div
      v-else-if="!puzzles?.length"
      class="text-center py-16 space-y-3"
    >
      <IconPuzzle class="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">No puzzles shared yet.</p>
    </div>

    <template v-else>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
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
              class="absolute top-2 left-2 text-label md:text-sm px-1.5 py-0.5 rounded text-white font-bold"
              :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
            >{{ puzzle.puzzle_type }}</span>
            <span
              class="absolute bottom-2 right-2 text-label md:text-sm px-1.5 py-0.5 rounded text-white font-bold"
              :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
            >{{ puzzle.difficulty }}</span>
          </div>
          <div class="p-2.5">
            <div class="flex items-center gap-1.5 min-w-0">
              <EntityNewDot :is-new="isNew(puzzle.id, puzzle.updated_at)" size="sm" />
              <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
            </div>
            <p v-if="puzzle.shared_hints.length" class="text-caption-sm md:text-sm text-primary mt-0.5">
              {{ puzzle.shared_hints.length }} hint{{ puzzle.shared_hints.length === 1 ? '' : 's' }} available
            </p>
          </div>
        </RouterLink>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { RouterLink } from "vue-router";
import { IconPuzzle } from '@/lib/icons';
import { usePlayerVisiblePuzzles } from "@/composables/usePuzzles";
import { useReadItems } from "@/composables/useReadItems";
import { PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EntityNewDot from "@/components/common/EntityNewDot.vue";

const { data: puzzles, isLoading } = usePlayerVisiblePuzzles();
const { isNew } = useReadItems("puzzle");
</script>
