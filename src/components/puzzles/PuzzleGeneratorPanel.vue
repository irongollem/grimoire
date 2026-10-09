<template>
  <GeneratorPanelShell
    v-model:open="ui.puzzleGeneratorOpen"
    v-model:concept="concept"
    v-model:generate-image="generateImage"
    title="Puzzle Generator"
    concept-placeholder="A flooded crypt where water levels rise unless the players reroute flow through a series of ancient stone sluices…"
    :credits="textCreditCost"
    :byok="textIsByok"
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
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreatePuzzle } from "@/composables/dungeon-features/usePuzzles";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GeneratorPanelShell from "@/components/common/GeneratorPanelShell.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useGenerationGate } from "@/composables/ai/useGenerationGate";
import { useCampaignProviders } from "@/composables/ai/useCampaignProviders";
import { usePuzzleGeneration } from "@/ai/usePuzzleGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createPuzzle } = useCreatePuzzle();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = usePuzzleGeneration();

const { showQuotaPaywall, canSpend, gateQuotaError } = useGenerationGate("puzzle_rooms");

const { costOf } = useAiCredits();
const { textCredits, textIsByok } = useCampaignProviders();
const textCreditCost = computed(
  () => textCredits(costOf("puzzle_generation")),
);

const concept       = ref("");
const constraints   = reactive({ puzzle_type: "", difficulty: "" });
const generateImage = ref(true);

async function generateAndCreate() {
  if (!canSpend(textCreditCost.value, textIsByok.value)) return;

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
    puzzle = await createPuzzle({
      name:                result.name,
      puzzle_type:         (result.puzzle_type as typeof PUZZLE_TYPES[number]) ?? "Logic",
      difficulty:          (result.difficulty as typeof PUZZLE_DIFFICULTIES[number]) ?? "Medium",
      description:         toTiptapJson(result.description),
      hints:               result.hints,
      solution:            toTiptapJson(result.solution),
      skill_checks:        result.skill_checks,
      success_outcome:     toTiptapJson(result.success_outcome),
      failure_consequence: toTiptapJson(result.failure_consequence),
      notes:               toTiptapJson(result.notes),
      tags:                result.tags,
      image_url:           result.image_url,
      image_focal_point:   null,
      // Scoped to the campaign it was generated for, like every other new
      // puzzle (#597) — the Scope control widens it if the DM wants it in all
      // of them. This was the one creation path still hardcoding null.
      campaign_id:         campaign.activeCampaignId,
      location_id:         null,
      dungeon_feature_id:  null,
      is_shared:           false,
      shared_hints:        [],
      player_visible_to:   [],
      read_aloud:          null,
      ai_provenance:       result.ai_provenance ?? null,
    });
  } catch (e) {
    if (gateQuotaError(e)) return;
    throw e;
  }

  completedEntityId.value = puzzle.id;
  ui.puzzleGeneratorOpen = false;
  router.push(`/puzzles/${puzzle.id}`);
}
</script>
