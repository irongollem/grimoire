<template>
  <ListPageLayout title="Enigmarium" description="Puzzle rooms, riddles & dungeon conundrums">
    <template #actions>
      <ListActionButton
        :icon="populateMutation.isPending.value ? IconLoading : IconPopulate"
        :label="populateStatusLabel"
        :disabled="populateMutation.isPending.value"
        @click="handlePopulate"
      />
      <ListActionButton
        :icon="IconGenerate"
        label="Generate"
        @click="ui.puzzleGeneratorOpen = true"
      />
      <ListActionButton
        :icon="IconAdd"
        label="New Puzzle"
        mobile-label="Puzzle"
        variant="primary"
        @click="router.push('/puzzles/new')"
      />
    </template>

    <template v-if="puzzles?.length" #filters>
      <ListFilterBar>
        <ListSearchInput v-model="search" placeholder="Search puzzles…" />
        <ListFilterSelect v-model="typeFilter" aria-label="Puzzle type filter">
          <option value="">All Types</option>
          <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
        </ListFilterSelect>
        <ListFilterSelect v-model="difficultyFilter" aria-label="Difficulty filter">
          <option value="">All Difficulties</option>
          <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
        </ListFilterSelect>
      </ListFilterBar>
    </template>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <template v-else-if="puzzles?.length">
      <p v-if="!filtered.length" class="text-center font-fell text-sm text-muted-foreground italic py-8">
        No puzzles match your filter.
      </p>

      <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-4">
        <RouterLink
          v-for="puzzle in filtered"
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
  </ListPageLayout>
</template>

<script setup lang="ts">
import { ref, computed } from "vue";
import { RouterLink, useRouter } from "vue-router";
import { IconAdd, IconGenerate, IconLoading, IconPopulate } from '@/lib/icons';
import { usePuzzles, usePopulatePuzzles } from "@/composables/usePuzzles";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_COLORS, PUZZLE_DIFFICULTY_COLORS } from "@/types/puzzle.types";
import { useUiStore } from "@/stores/ui";
import ListPageLayout from "@/components/common/ListPageLayout.vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import ListFilterBar from "@/components/common/ListFilterBar.vue";
import ListFilterSelect from "@/components/common/ListFilterSelect.vue";
import ListSearchInput from "@/components/common/ListSearchInput.vue";
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
