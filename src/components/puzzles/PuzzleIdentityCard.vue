<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden">
    <div class="flex gap-0">
      <!-- Portrait -->
      <div class="shrink-0 w-40 sm:w-52 self-stretch">
        <FocalImage
          :src="puzzle.image_url"
          :alt="puzzle.name"
          format="portrait"
          :focal-point="puzzle.image_focal_point"
          placeholder="/assets/placeholders/enigma.webp"
          class="h-full"
        />
      </div>

      <!-- Title + meta -->
      <div class="flex-1 p-4 flex flex-col gap-2 min-w-0">
        <h2 class="font-cinzel text-xl font-bold text-foreground leading-tight">{{ puzzle.name }}</h2>
        <div class="flex flex-wrap gap-2">
          <span
            class="font-cinzel text-2xs px-2 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
          >{{ puzzle.puzzle_type }}</span>
          <span
            class="font-cinzel text-2xs px-2 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
          >{{ puzzle.difficulty }}</span>
        </div>
        <div v-if="puzzle.tags.length" class="flex flex-wrap gap-1 mt-auto">
          <span
            v-for="tag in puzzle.tags"
            :key="tag"
            class="font-cinzel text-[0.5625rem] px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground tracking-wider"
          >{{ tag }}</span>
        </div>

        <!-- Skill checks -->
        <div v-if="puzzle.skill_checks.length" class="flex flex-wrap gap-2 mt-1">
          <span
            v-for="sc in puzzle.skill_checks"
            :key="sc.skill"
            class="font-fell text-[0.6875rem] text-muted-foreground"
          >
            {{ sc.skill }} DC {{ sc.dc }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import type { PuzzleRoom } from "@/types/puzzle.types";
import FocalImage from "@/components/common/FocalImage.vue";

const { puzzle } = defineProps<{ puzzle: PuzzleRoom }>();
</script>
