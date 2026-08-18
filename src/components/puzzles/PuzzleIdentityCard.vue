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
        <h2 class="text-heading-lg font-bold text-foreground leading-tight">{{ puzzle.name }}</h2>
        <div class="flex flex-wrap gap-2">
          <span
            class="text-label px-2 py-0.5 rounded text-white font-bold"
            :class="PUZZLE_TYPE_BG[puzzle.puzzle_type]"
          >{{ puzzle.puzzle_type }}</span>
          <span
            class="text-label px-2 py-0.5 rounded text-white font-bold"
            :class="PUZZLE_DIFFICULTY_BG[puzzle.difficulty]"
          >{{ puzzle.difficulty }}</span>
        </div>
        <div v-if="puzzle.tags.length" class="flex flex-wrap gap-1 mt-auto">
          <span
            v-for="tag in puzzle.tags"
            :key="tag"
            class="text-label px-1.5 py-0.5 rounded-full bg-muted text-muted-foreground"
          >{{ tag }}</span>
        </div>

        <!-- Skill checks -->
        <div v-if="puzzle.skill_checks.length" class="flex flex-wrap gap-2 mt-1">
          <span
            v-for="sc in puzzle.skill_checks"
            :key="sc.skill"
            class="text-caption text-muted-foreground"
          >
            {{ sc.skill }} DC {{ sc.dc }}
          </span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { PUZZLE_TYPE_BG, PUZZLE_DIFFICULTY_BG } from "@/types/puzzle.types";
import type { PuzzleRoom } from "@/types/puzzle.types";
import FocalImage from "@/components/common/FocalImage.vue";

const { puzzle } = defineProps<{ puzzle: PuzzleRoom }>();
</script>
