<template>
  <div class="space-y-4">
    <!-- Back -->
    <RouterLink
      to="/play/puzzles"
      class="inline-flex items-center gap-1.5 text-label-lg font-semibold text-muted-foreground hover:text-foreground transition-colors"
    >
      <IconChevronLeft class="h-3.5 w-3.5" />
      Puzzles
    </RouterLink>

    <div v-if="isLoading" class="flex justify-center py-16">
      <LoadingSpinner />
    </div>

    <div
      v-else-if="!puzzle || !puzzle.is_shared"
      class="text-center py-16 space-y-3"
    >
      <IconPuzzle class="h-10 w-10 text-muted-foreground/30 mx-auto" />
      <p class="font-cinzel text-sm text-muted-foreground">Puzzle not found.</p>
    </div>

    <template v-else>
      <!-- Art + Title -->
      <div class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="flex gap-0">
          <div v-if="puzzle.image_url" class="shrink-0 w-36 sm:w-44 self-stretch">
            <FocalImage
              :src="puzzle.image_url"
              :alt="puzzle.name"
              format="portrait"
              :focal-point="puzzle.image_focal_point"
              :lightbox="true"
              class="h-full"
            />
          </div>
          <div class="flex-1 p-4 flex flex-col gap-2 min-w-0">
            <h2 class="text-heading font-bold text-foreground leading-tight">{{ puzzle.name }}</h2>
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
            <div v-if="puzzle.skill_checks.length" class="flex flex-wrap gap-x-3 gap-y-1 mt-1">
              <span
                v-for="sc in puzzle.skill_checks"
                :key="sc.skill"
                class="text-caption text-muted-foreground"
              >{{ sc.skill }} DC {{ sc.dc }}</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Read-aloud -->
      <div v-if="puzzle.read_aloud" class="rounded-lg border border-primary/30 bg-primary/5 px-4 py-3">
        <p class="text-label font-semibold text-primary mb-2">READ ALOUD</p>
        <p class="text-body text-foreground leading-relaxed italic">{{ puzzle.read_aloud }}</p>
      </div>

      <!-- Setup description -->
      <div v-if="puzzle.description" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">The Room</span>
        </div>
        <div class="p-4">
          <RichTextViewer :content="puzzle.description" />
        </div>
      </div>

      <!-- Revealed hints -->
      <div v-if="revealedHints.length" class="rounded-lg border border-border bg-card overflow-hidden">
        <div class="px-3 py-2 border-b border-border bg-muted/20">
          <span class="text-label-lg font-semibold text-muted-foreground">
            Hints
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(revealed by the DM)</span>
          </span>
        </div>
        <div class="divide-y divide-border">
          <div
            v-for="hint in revealedHints"
            :key="hint.order"
            class="flex items-start gap-3 px-4 py-3"
          >
            <span class="shrink-0 font-cinzel text-2xs font-bold text-muted-foreground/60 w-4 mt-0.5">{{ hint.order }}</span>
            <div class="flex-1 min-w-0">
              <RichTextViewer :content="hint.text" />
            </div>
          </div>
        </div>
      </div>

      <div v-else class="rounded-lg border border-border bg-muted/20 px-4 py-3 text-center">
        <p class="text-caption text-muted-foreground italic">No hints revealed yet.</p>
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, watch } from "vue";
import { RouterLink, useRoute } from "vue-router";
import { IconChevronLeft, IconPuzzle } from '@/lib/icons';
import { usePlayerVisiblePuzzle } from "@/composables/usePuzzles";
import { useMarkRead } from "@/composables/useReadItems";
import { PUZZLE_TYPE_BG, PUZZLE_DIFFICULTY_BG } from "@/types/puzzle.types";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import FocalImage from "@/components/common/FocalImage.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";

const route = useRoute();
const id    = computed(() => route.params.id as string);

const { data: puzzle, isLoading } = usePlayerVisiblePuzzle(id);

const { mutate: markRead } = useMarkRead();
watch(puzzle, (p) => {
  if (p?.id) markRead({ entityType: "puzzle", entityId: p.id });
}, { immediate: true });

const revealedHints = computed(() => {
  if (!puzzle.value) return [];
  const revealed = new Set(puzzle.value.shared_hints);
  return puzzle.value.hints
    .filter((h) => revealed.has(h.order))
    .sort((a, b) => a.order - b.order);
});
</script>
