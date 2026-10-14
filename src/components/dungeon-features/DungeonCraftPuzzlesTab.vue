<template>
  <DungeonCraftEntityGrid
    :items="puzzles"
    :is-loading="puzzlesLoading"
    v-model:search="puzzlesSearch"
    :shown="filteredPuzzles"
    :item-key="puzzleKey"
    list-key="puzzles"
    search-placeholder="Search puzzles…"
    no-match-text="No puzzles match your filter."
    empty-icon="Puzzle"
    empty-title="No puzzles yet"
    :empty-description="emptyDescription"
    empty-action-label="New Puzzle"
    table="puzzle_rooms"
    :ids="puzzleFilteredIds"
    copy-label="puzzle"
    @empty-action="router.push('/puzzles/new')"
  >
    <template #filters>
      <AppSelect v-model="puzzlesFilterType" tone="card" size="body">
        <option value="">All Types</option>
        <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
      </AppSelect>
      <AppSelect v-model="puzzlesFilterDifficulty" tone="card" size="body">
        <option value="">All Difficulties</option>
        <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
      </AppSelect>
      <AppButton
        v-if="puzzlesUi.puzzlesHasActiveFilters"
        variant="subtle"
        size="body"
        label="Clear"
        @click="puzzlesUi.resetPuzzlesFilters()"
      />
    </template>
    <template #card="{ item: puzzle, selecting, isSelected, toggle }">
      <BulkSelectableCard
        corner="top-right"
        :selected="isSelected(puzzle.id)"
        :selecting="selecting && !isLibraryPuzzle(puzzle)"
        @toggle="toggle(puzzle.id)"
      >
        <RouterLink
          :to="`/puzzles/${puzzle.id}`"
          class="flex h-full flex-col rounded-lg border border-border bg-card overflow-hidden hover:border-primary/50 transition-colors group"
        >
          <div class="relative aspect-square bg-muted overflow-hidden shrink-0">
            <FocalImage
              :src="puzzle.image_url"
              :alt="puzzle.name"
              format="portrait"
              :focal-point="puzzle.image_focal_point"
              :placeholder="placeholderUrl('enigma')"
              class="group-hover:scale-105 transition-transform duration-300"
              ai-badge="left"
            />
            <span
              class="absolute top-2 left-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
              :class="PUZZLE_TYPE_BG[puzzle.puzzle_type]"
            >{{ puzzle.puzzle_type }}</span>
            <LibraryBadge
              v-if="isLibraryPuzzle(puzzle)"
              tone="overlay"
              class="absolute top-2 right-2"
            />
            <span
              class="absolute bottom-2 right-2 text-label px-1.5 py-0.5 rounded text-white font-bold"
              :class="PUZZLE_DIFFICULTY_BG[puzzle.difficulty]"
            >{{ puzzle.difficulty }}</span>
          </div>
          <div class="p-2.5 flex flex-col gap-1">
            <h3 class="text-heading-xs font-bold text-foreground leading-tight truncate">{{ puzzle.name }}</h3>
            <div class="flex items-center gap-2">
              <span class="text-caption-sm text-muted-foreground italic">
                {{ puzzle.hints.length }} hint{{ puzzle.hints.length === 1 ? '' : 's' }}
              </span>
              <span v-if="puzzle.skill_checks.length" class="text-caption-sm text-muted-foreground italic truncate">
                · {{ puzzle.skill_checks.map((s) => s.skill).join(', ') }}
              </span>
            </div>
            <PlacedInLine v-if="!isLibraryPuzzle(puzzle)" :rooms="placedInRows(puzzle)" />
          </div>
        </RouterLink>
      </BulkSelectableCard>
    </template>
    <template #row="{ item: puzzle, selecting, isSelected, toggle }">
      <BulkSelectableCard
        corner="top-right"
        :selected="isSelected(puzzle.id)"
        :selecting="selecting && !isLibraryPuzzle(puzzle)"
        @toggle="toggle(puzzle.id)"
      >
        <EntityListRow
          :to="`/puzzles/${puzzle.id}`"
          :title="puzzle.name"
          :subtitle="puzzleSubtitle(puzzle)"
          :image-url="puzzle.image_url"
          :fallback-icon="IconPuzzle"
          :tags="isLibraryPuzzle(puzzle) ? ['Library', puzzle.puzzle_type, puzzle.difficulty] : [puzzle.puzzle_type, puzzle.difficulty]"
        />
      </BulkSelectableCard>
    </template>
  </DungeonCraftEntityGrid>
</template>

<script setup lang="ts">
import { useDungeonCraftBooksOffered } from "@/composables/library/useEnabledSources";
import LibraryBadge from "@/components/common/entity/LibraryBadge.vue";
import { computed } from "vue";
import { storeToRefs } from "pinia";
import { RouterLink, useRouter } from "vue-router";
import { useLibraryPuzzles, usePuzzles } from "@/composables/dungeon-features/usePuzzles";
import { usePlacedInRooms } from "@/composables/dungeon-features/usePlacedInRooms";
import { directRoomPlacement } from "@/lib/dungeon-features/placedIn";
import type { PlacedInRoom } from "@/lib/dungeon-features/placedIn";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES, PUZZLE_TYPE_BG, PUZZLE_DIFFICULTY_BG } from "@/types/puzzle.types";
import type { LibraryPuzzle, PuzzleRoom } from "@/types/puzzle.types";
import { isLibraryId, shadowByName, featureRefOf } from "@/lib/dungeon-features/library";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import EntityListRow from "@/components/common/entity/EntityListRow.vue";
import { IconPuzzle } from "@/lib/icons";
import FocalImage from "@/components/common/media/FocalImage.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import BulkSelectableCard from "@/components/common/list/BulkSelectableCard.vue";
import DungeonCraftEntityGrid from "./DungeonCraftEntityGrid.vue";
import PlacedInLine from "./PlacedInLine.vue";
import { placeholderUrl } from "@/lib/placeholderFocalPoints";

const router = useRouter();
// An empty list with Grimoire's books on offer means none is switched on (#1060).
const booksOffered = useDungeonCraftBooksOffered();
const emptyDescription = computed(() =>
  booksOffered.value ? "Add the Grimoire library from the book icon above, or create your own." : "Build your first puzzle room: set the riddle, add tiered hints, and record the solution.",
);

const { data: ownPuzzles, isLoading: ownLoading } = usePuzzles();
const { data: libraryPuzzles, isLoading: libraryLoading } = useLibraryPuzzles();
type PuzzleEntry = PuzzleRoom | LibraryPuzzle;
// Grimoire's puzzles beside the DM's own; an own puzzle of the same name hides
// its library original (a "Use in campaign" copy keeps the name). Library rows
// are copied on use, so they are listed, never selected for bulk actions.
const puzzles = computed<PuzzleEntry[] | undefined>(() =>
  ownPuzzles.value && libraryPuzzles.value ? shadowByName(libraryPuzzles.value, ownPuzzles.value) : undefined,
);
const puzzlesLoading = computed(() => ownLoading.value || libraryLoading.value);
const isLibraryPuzzle = (p: PuzzleEntry): p is LibraryPuzzle => isLibraryId(p.id);
const puzzlesUi = usePuzzlesUiStore();
// Filter state lives in the UI store, not local refs, so it survives
// navigating into a puzzle and back without outliving the session.
const { puzzlesSearch, puzzlesFilterType, puzzlesFilterDifficulty } = storeToRefs(puzzlesUi);

// ── Placed in (#868, S8, frame 11) ────────────────────────────────────────────
// Not from `location_placements` — a puzzle anchors via its own feature
// (own or library, `featureRefOf`; draws wherever that feature is placed) or
// `location_id` (a bare room, no cell of its own) instead of a join row.
// Library puzzles have no anchor, so they show no placement.
const hostFeatureIds = computed(() =>
  (ownPuzzles.value ?? []).map(featureRefOf).filter((id): id is string => !!id),
);
const { placedInRows: placedInRowsForFeature, locationsById } = usePlacedInRooms("dungeon_feature", hostFeatureIds);

function placedInRows(puzzle: PuzzleRoom): PlacedInRoom[] {
  const host = featureRefOf(puzzle);
  if (host) return placedInRowsForFeature(host);
  if (puzzle.location_id) return [directRoomPlacement(puzzle.location_id, locationsById.value)];
  return [];
}

const puzzleKey = (puzzle: PuzzleEntry) => puzzle.id;
function puzzleSubtitle(puzzle: PuzzleEntry): string {
  const hints = `${puzzle.hints.length} hint${puzzle.hints.length === 1 ? "" : "s"}`;
  return puzzle.skill_checks.length ? `${hints} · ${puzzle.skill_checks.map((s) => s.skill).join(", ")}` : hints;
}

const filteredPuzzles = computed(() => {
  let list = puzzles.value ?? [];
  if (puzzlesFilterType.value) list = list.filter((p) => p.puzzle_type === puzzlesFilterType.value);
  if (puzzlesFilterDifficulty.value) list = list.filter((p) => p.difficulty === puzzlesFilterDifficulty.value);
  const q = puzzlesSearch.value.toLowerCase().trim();
  if (q) list = list.filter((p) =>
    p.name.toLowerCase().includes(q) ||
    p.tags.some((t) => t.toLowerCase().includes(q)),
  );
  return list;
});

// "Select all shown" reads every row passing the current filters (#875).
const puzzleFilteredIds = computed(() => filteredPuzzles.value.filter((p) => !isLibraryPuzzle(p)).map((p) => p.id));
</script>
