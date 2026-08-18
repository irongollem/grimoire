<template>
  <DungeonCraftEntityGrid
    :items="puzzles"
    :is-loading="puzzlesLoading"
    v-model:search="puzzlesSearch"
    :filtered-count="filteredPuzzles.length"
    search-placeholder="Search puzzles…"
    no-match-text="No puzzles match your filter."
    empty-icon="Puzzle"
    empty-title="No puzzles yet"
    empty-description="Build your first puzzle room — set the riddle, add tiered hints, and record the solution."
    empty-action-label="New Puzzle"
    @empty-action="router.push('/puzzles/new')"
  >
    <template #filters>
      <select
        v-model="puzzlesTypeFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Types</option>
        <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <select
        v-model="puzzlesDifficultyFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Difficulties</option>
        <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
      </select>
    </template>
    <template #card>
      <RouterLink
        v-for="puzzle in filteredPuzzles"
        :key="puzzle.id"
        :to="`/puzzles/${puzzle.id}`"
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
            class="absolute top-2 left-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
            :class="PUZZLE_TYPE_BG[puzzle.puzzle_type]"
          >{{ puzzle.puzzle_type }}</span>
          <span
            class="absolute bottom-2 right-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
            :class="PUZZLE_DIFFICULTY_BG[puzzle.difficulty]"
          >{{ puzzle.difficulty }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
          <div class="flex items-center gap-2">
            <span class="text-caption-sm text-muted-foreground italic">
              {{ puzzle.hints.length }} hint{{ puzzle.hints.length === 1 ? '' : 's' }}
            </span>
            <span v-if="puzzle.skill_checks.length" class="text-caption-sm text-muted-foreground italic truncate">
              · {{ puzzle.skill_checks.map((s) => s.skill).join(', ') }}
            </span>
          </div>
        </div>
      </RouterLink>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { usePuzzles } from "@/composables/usePuzzles";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_BG, PUZZLE_DIFFICULTY_BG } from "@/types/puzzle.types";
import FocalImage from "@/components/common/FocalImage.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";

const router = useRouter();
const { data: puzzles, isLoading: puzzlesLoading } = usePuzzles();
const puzzlesSearch           = ref("");
const puzzlesTypeFilter       = ref("");
const puzzlesDifficultyFilter = ref("");

const filteredPuzzles = computed(() => {
  let list = puzzles.value ?? [];
  if (puzzlesTypeFilter.value) list = list.filter((p) => p.puzzle_type === puzzlesTypeFilter.value);
  if (puzzlesDifficultyFilter.value) list = list.filter((p) => p.difficulty === puzzlesDifficultyFilter.value);
  const q = puzzlesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return list;
});
</script>
