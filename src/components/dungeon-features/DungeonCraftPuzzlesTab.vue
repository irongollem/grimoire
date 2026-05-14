<template>
  <div v-if="puzzlesLoading" class="flex justify-center py-16">
    <LoadingSpinner />
  </div>
  <template v-else-if="puzzles?.length">
    <div class="flex flex-wrap items-center gap-2 mb-4">
      <input
        v-model="puzzlesSearch"
        type="search"
        placeholder="Search puzzles…"
        class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      />
      <select
        v-model="puzzlesTypeFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Types</option>
        <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
      </select>
      <select
        v-model="puzzlesDifficultyFilter"
        class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
      >
        <option value="">All Difficulties</option>
        <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
      </select>
    </div>
    <p v-if="!filteredPuzzles.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
      No puzzles match your filter.
    </p>
    <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
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
            class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
          >{{ puzzle.puzzle_type }}</span>
          <span
            class="absolute bottom-2 right-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
            :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
          >{{ puzzle.difficulty }}</span>
        </div>
        <div class="p-2.5 flex flex-col gap-0.5">
          <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
          <div class="flex items-center gap-2">
            <span class="font-fell text-[10px] text-muted-foreground italic">
              {{ puzzle.hints.length }} hint{{ puzzle.hints.length === 1 ? '' : 's' }}
            </span>
            <span v-if="puzzle.skill_checks.length" class="font-fell text-[10px] text-muted-foreground italic truncate">
              · {{ puzzle.skill_checks.map((s) => s.skill).join(', ') }}
            </span>
          </div>
        </div>
      </RouterLink>
    </div>
  </template>
  <EmptyState
    v-else
    icon="Puzzle"
    title="No puzzles yet"
    description="Build your first puzzle room — set the riddle, add tiered hints, and record the solution."
    action-label="New Puzzle"
    @action="router.push('/puzzles/new')"
  />
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { usePuzzles } from "@/composables/usePuzzles";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import FocalImage from "@/components/common/FocalImage.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import EmptyState from "@/components/common/EmptyState.vue";

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
