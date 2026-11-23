<template>
  <GeneratorPanelShell
    v-model:open="puzzlesUi.puzzleGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Puzzle Generator"
    concept-placeholder="A flooded crypt where water levels rise unless the players reroute flow through a series of ancient stone sluices…"
    :credits="quote.total"
    :byok="quote.byok"
    :is-generating="isGenerating"
    :error="genError"
    blank-to="/puzzles/new"
    blank-label="New Blank Puzzle"
    image-toggle-label="Generate room illustration"
    @generate="generateAndCreate"
  >
    <template #constraints>
      <div class="grid grid-cols-2 gap-2">
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Type</label>
          <AppSelect v-model="constraints.puzzle_type" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
          </AppSelect>
        </div>
        <div>
          <label class="block text-caption text-muted-foreground mb-1">Difficulty</label>
          <AppSelect v-model="constraints.difficulty" tone="filled" size="body" weight="normal" block>
            <option value="">Any</option>
            <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
          </AppSelect>
        </div>
      </div>
    </template>
  </GeneratorPanelShell>

  <PaywallModal v-model="showQuotaPaywall" resource="puzzle_rooms" />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { useRouter } from "vue-router";
import { usePuzzlesUiStore } from "@/stores/ui/puzzles";
import { useGeneratePuzzle } from "@/composables/dungeon-features/useGeneratePuzzle";
import { usePuzzleQuote } from "@/composables/ai/quotes/puzzleQuote";
import PaywallModal from "@/components/common/overlays/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/ai/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { usePuzzleGeneration } from "@/ai/usePuzzleGeneration";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";

const puzzlesUi = usePuzzlesUiStore();
const router   = useRouter();
const { saveGeneratedPuzzle } = useGeneratePuzzle();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = usePuzzleGeneration();

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("puzzle_rooms");

// The price is the quote's, the one Ask Grimoire shows too: it counts the picture the panel paints by default.
const quotePuzzle = usePuzzleQuote();

const concept       = ref("");
const constraints   = reactive({ puzzle_type: "", difficulty: "" });
const generateImage = ref(true);

const quote = computed(() => quotePuzzle({ image: generateImage.value }));

async function generateAndCreate() {
  if (!canSpend(quote.value.total, quote.value.byok)) return;

  genConcept.value = concept.value.trim();
  clearCompleted();

  const result = await generate(
    concept.value.trim(),
    {
      puzzle_type:   constraints.puzzle_type || undefined,
      difficulty:    constraints.difficulty || undefined,
      generateImage: generateImage.value,
    },
  );

  if (!result) return;

  let puzzle;
  try {
    puzzle = await saveGeneratedPuzzle(result);
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }

  completedEntityId.value = puzzle.id;
  puzzlesUi.puzzleGeneratorOpen = false;
  router.push(`/puzzles/${puzzle.id}`);
}
</script>
