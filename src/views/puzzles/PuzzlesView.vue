<template>
  <PageHeader title="Enigmarium" description="Puzzle rooms, riddles & dungeon conundrums">
    <template #actions>
      <button
        type="button"
        :disabled="populateMutation.isPending.value"
        class="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-3 py-1.5 font-cinzel text-xs font-semibold text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors disabled:opacity-50"
        @click="handlePopulate"
      >
        <Loader2 v-if="populateMutation.isPending.value" class="size-3.5 animate-spin shrink-0" />
        <BookOpen v-else class="size-3.5 shrink-0" />
        {{ populateStatusLabel }}
      </button>
      <button
        class="inline-flex items-center gap-1.5 font-cinzel text-xs font-semibold px-3 py-1.5 rounded-md border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50 transition-colors"
        @click="ui.puzzleGeneratorOpen = true"
      >
        <Sparkles class="size-3.5 shrink-0" />
        Generate
      </button>
      <button
        class="font-cinzel text-xs font-semibold px-3 py-1.5 rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
        @click="router.push('/puzzles/new')"
      >
        New Puzzle
      </button>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="puzzles?.length">
      <!-- Filters -->
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <input
          v-model="search"
          type="search"
          placeholder="Search puzzles…"
          class="flex-1 min-w-40 bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <select
          v-model="typeFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Types</option>
          <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
        </select>
        <select
          v-model="difficultyFilter"
          class="bg-card border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        >
          <option value="">All Difficulties</option>
          <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
        </select>
      </div>

      <p v-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
        No puzzles match your filter.
      </p>

      <!-- Grid -->
      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <RouterLink
          v-for="puzzle in filtered"
          :key="puzzle.id"
          :to="`/puzzles/${puzzle.id}`"
          class="flex flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
        >
          <!-- Image / placeholder -->
          <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
            <FocalImage
              v-if="puzzle.image_url"
              :src="puzzle.image_url"
              :alt="puzzle.name"
              format="portrait"
              :focal-point="puzzle.image_focal_point"
              class="group-hover:scale-105 transition-transform duration-300"
            />
            <div v-else class="w-full h-full flex items-center justify-center text-muted-foreground/20">
              <PuzzleIcon class="h-10 w-10" />
            </div>
            <!-- Type badge -->
            <span
              class="absolute top-2 left-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
              :style="{ backgroundColor: PUZZLE_TYPE_COLORS[puzzle.puzzle_type] + 'DD' }"
            >{{ puzzle.puzzle_type }}</span>
            <!-- Difficulty badge -->
            <span
              class="absolute bottom-2 right-2 font-cinzel text-[9px] px-1.5 py-0.5 rounded tracking-wider text-white font-bold"
              :style="{ backgroundColor: PUZZLE_DIFFICULTY_COLORS[puzzle.difficulty] + 'DD' }"
            >{{ puzzle.difficulty }}</span>
          </div>

          <!-- Info -->
          <div class="p-2.5 flex flex-col gap-0.5">
            <h3 class="font-cinzel text-sm font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
            <div class="flex items-center gap-2">
              <span class="font-fell text-[10px] text-muted-foreground italic">
                {{ puzzle.hints.length }} hint{{ puzzle.hints.length === 1 ? '' : 's' }}
              </span>
              <span v-if="puzzle.skill_checks.length" class="font-fell text-[10px] text-muted-foreground italic truncate">
                · {{ puzzle.skill_checks.map(s => s.skill).join(', ') }}
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
  </PageHeader>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { Puzzle as PuzzleIcon, Loader2, BookOpen, Sparkles } from "lucide-vue-next";
import { usePuzzles, usePopulatePuzzles } from "@/composables/usePuzzles";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import { useUiStore } from "@/stores/ui";
import PageHeader from "@/components/common/PageHeader.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import EmptyState from "@/components/common/EmptyState.vue";

const ui = useUiStore();

const router = useRouter();
const { data: puzzles, isLoading } = usePuzzles();

const search          = ref("");
const typeFilter      = ref("");
const difficultyFilter = ref("");

const filtered = computed(() => {
  let list = puzzles.value ?? [];
  if (typeFilter.value) list = list.filter((p) => p.puzzle_type === typeFilter.value);
  if (difficultyFilter.value) list = list.filter((p) => p.difficulty === difficultyFilter.value);
  const q = search.value.toLowerCase().trim();
  if (q) list = list.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.tags.some((tag) => tag.toLowerCase().includes(q)),
  );
  return list;
});

const populateMutation = usePopulatePuzzles();
const populateStatus   = ref<"idle" | "done" | "uptodate">("idle");
const populatedCount   = ref(0);
const populateError    = ref<string | null>(null);

const populateStatusLabel = computed(() => {
  if (populateMutation.isPending.value) return "Populating…";
  if (populateError.value) return `Error: ${populateError.value}`;
  if (populateStatus.value === "done") return `Added ${populatedCount.value} puzzles`;
  if (populateStatus.value === "uptodate") return "Already up to date";
  return "Populate Examples";
});

async function handlePopulate() {
  populateStatus.value = "idle";
  populateError.value = null;
  try {
    const count = await populateMutation.mutateAsync();
    populatedCount.value = count;
    populateStatus.value = count === 0 ? "uptodate" : "done";
  } catch (e) {
    populateError.value = e instanceof Error ? e.message : String(e);
  }
  setTimeout(() => {
    populateStatus.value = "idle";
    populateError.value = null;
  }, 8000);
}
</script>
