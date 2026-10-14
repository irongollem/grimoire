<template>
  <PageHeader :title="puzzle?.name ?? 'Puzzle'">
    <div v-if="isLoading" class="flex justify-center py-16"><LoadingSpinner /></div>
    <p v-else-if="!puzzle" class="text-body text-muted-foreground italic">This puzzle is not in the library.</p>
    <div v-else class="flex flex-col gap-5 max-w-2xl">
      <!-- Read-only library banner (same shape as MonsterDetail's) -->
      <LibraryReadOnlyBanner
        message="Read-only reference. Use it in your campaign to get your own editable copy."
        action-label="Use in campaign"
        busy-label="Copying…"
        :busy="using"
        :disabled="!activeCampaignId"
        disabled-reason="Pick a campaign first"
        @action="useInCampaign"
      />

      <PuzzleIdentityCard :puzzle="puzzle" />

      <LibraryPuzzlePanel v-if="puzzle.read_aloud" title="Read-Aloud">
        <p class="text-body text-foreground whitespace-pre-line">{{ puzzle.read_aloud }}</p>
      </LibraryPuzzlePanel>

      <LibraryPuzzlePanel v-if="puzzle.description" title="Setup">
        <RichTextViewer :content="puzzle.description" />
      </LibraryPuzzlePanel>

      <LibraryPuzzlePanel v-if="puzzle.hints.length" title="Hints" flush>
        <div class="divide-y divide-border">
          <div v-for="hint in sortedHints" :key="hint.order" class="flex items-start gap-3 px-4 py-3">
            <span class="shrink-0 text-label font-bold text-muted-foreground/60 w-4 mt-0.5">{{ hint.order }}</span>
            <div class="flex-1 min-w-0"><RichTextViewer :content="hint.text" /></div>
          </div>
        </div>
      </LibraryPuzzlePanel>

      <LibraryPuzzlePanel v-if="puzzle.solution" title="Solution">
        <RichTextViewer :content="puzzle.solution" />
      </LibraryPuzzlePanel>

      <LibraryPuzzlePanel v-if="puzzle.success_outcome || puzzle.failure_consequence" title="Outcomes" flush>
        <div class="divide-y divide-border">
          <div v-if="puzzle.success_outcome" class="p-4">
            <p class="text-eyebrow font-semibold text-primary mb-1.5">SUCCESS</p>
            <RichTextViewer :content="puzzle.success_outcome" />
          </div>
          <div v-if="puzzle.failure_consequence" class="p-4">
            <p class="text-label font-semibold text-destructive mb-1.5">FAILURE</p>
            <RichTextViewer :content="puzzle.failure_consequence" />
          </div>
        </div>
      </LibraryPuzzlePanel>

      <LibraryPuzzlePanel v-if="puzzle.notes" title="Notes">
        <RichTextViewer :content="puzzle.notes" />
      </LibraryPuzzlePanel>
    </div>
  </PageHeader>
  <PaywallModal v-model="showPaywall" resource="puzzle_rooms" />
</template>

<script setup lang="ts">
/**
 * A Grimoire-authored puzzle, read only (#1060). Puzzles are copied on use:
 * "Use in campaign" inserts an own row in the active campaign and replaces this
 * route with it, so the DM lands where sharing and placement are set up (the
 * Customize precedent in MonsterDetail). No reveal, hint or edit control here.
 */
import { computed, ref } from "vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useLibraryPuzzle, useCopyLibraryPuzzleToCampaign } from "@/composables/dungeon-features/usePuzzles";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";
import PageHeader from "@/components/common/list/PageHeader.vue";
import LibraryReadOnlyBanner from "@/components/common/entity/LibraryReadOnlyBanner.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import RichTextViewer from "@/components/common/richtext/RichTextViewer.vue";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import PuzzleIdentityCard from "./PuzzleIdentityCard.vue";
import LibraryPuzzlePanel from "./LibraryPuzzlePanel.vue";

const { puzzleId } = defineProps<{ puzzleId: string }>();

const router = useRouter();
const toast = useToast();
const { activeCampaignId } = storeToRefs(useCampaignStore());
const { data: puzzle, isLoading } = useLibraryPuzzle(() => puzzleId);
const { mutateAsync: useIt, isPending: using } = useCopyLibraryPuzzleToCampaign();
const showPaywall = ref(false);

// Null while the puzzle loads; v-for over null renders nothing.
const sortedHints = computed(() => (puzzle.value ? [...puzzle.value.hints].sort((a, b) => a.order - b.order) : null));

async function useInCampaign() {
  if (!puzzle.value) return;
  try {
    const copy = await useIt(puzzle.value);
    router.replace(`/puzzles/${copy.id}`);
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) { showPaywall.value = true; return; }
    toast.error(toast.fromError(e));
  }
}
</script>
