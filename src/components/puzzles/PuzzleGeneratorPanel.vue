<template>
  <Transition name="fade">
    <div
      v-if="ui.puzzleGeneratorOpen"
      class="fixed inset-0 bg-black/60 z-40"
      @click="ui.puzzleGeneratorOpen = false"
    />
  </Transition>

  <Transition name="slide-right">
    <aside
      v-if="ui.puzzleGeneratorOpen"
      class="fixed right-0 top-0 bottom-0 w-full max-w-md bg-card border-l border-border z-50 flex flex-col"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-semibold text-foreground">Puzzle Generator</h2>
        <AppButton variant="ghost" size="inline-xs" tooltip="Close" aria-label="Close" :icon="IconClose" icon-size="lg" @click="ui.puzzleGeneratorOpen = false" />
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A flooded crypt where water levels rise unless the players reroute flow through a series of ancient stone sluices…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="text-caption"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="text-label-lg font-semibold text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

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
        </div>

        <!-- Image generation toggle -->
        <div v-if="isAiEnabled" class="flex items-center justify-between">
          <span class="text-caption text-muted-foreground">Generate room illustration</span>
          <ToggleSwitch v-model="generateImage" aria-label="Generate room illustration" />
        </div>

        <!-- No API key nudge -->
        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <AppButton
            variant="ghost"
            size="inline-caption"
            class="mt-1 underline underline-offset-2"
            label="Continue in background"
            @click="ui.puzzleGeneratorOpen = false"
          />
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="text-caption text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <GenerationCostBadge
          v-if="isPro && isAiEnabled"
          :credits="textCreditCost"
          :byok="textIsByok"
          class="self-center"
        />
        <AppButton
          v-if="isPro && isAiEnabled"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || !concept.trim() || !affordable(textCreditCost, textIsByok)"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="isGenerating ? 'Generating…' : 'Generate with AI'"
          @click="generateAndCreate"
        />
        <AppButton
          v-else-if="!isPro"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          label="Generate with AI"
          @click="showPaywall = true"
        />
        <AppButton
          to="/puzzles/new"
          :variant="isPro && !aiApiKey ? 'primary' : 'outline'"
          size="md"
          block
          label="New Blank Puzzle"
          @click="ui.puzzleGeneratorOpen = false"
        />
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate puzzles, NPCs, monsters, items, spells, and session artwork." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreatePuzzle } from "@/composables/usePuzzles";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";
import { usePuzzleGeneration } from "@/ai/usePuzzleGeneration";
import { toTiptapJson } from "@/ai/useNpcGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import { PUZZLE_TYPES, PUZZLE_DIFFICULTIES } from "@/types/puzzle.types";

const ui       = useUiStore();
const router   = useRouter();
const campaign = useCampaignStore();
const { mutateAsync: createPuzzle } = useCreatePuzzle();
const { isGenerating, error: genError, completedEntityId, concept: genConcept, clearCompleted, generate } = usePuzzleGeneration();

const aiApiKey = computed(() => campaign.decryptedApiKey);
const isAiEnabled = computed(() => campaign.isAiEnabled);
const { isPro } = useSubscription();
const showPaywall = ref(false);

const { costOf, affordable } = useAiCredits();
const { textMultiplierFor } = useProviderConfig();
const textProvider = computed(() => campaign.activeCampaign?.text_provider ?? "openai");
const textIsByok = computed(() => !!campaign.decryptedApiKey);
const textCreditCost = computed(
  () => Math.round(costOf("puzzle_generation") * textMultiplierFor(textProvider.value) * 100) / 100,
);

const concept       = ref("");
const constraints   = reactive({ puzzle_type: "", difficulty: "" });
const generateImage = ref(true);

async function generateAndCreate() {
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

  const puzzle = await createPuzzle({
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

  completedEntityId.value = puzzle.id;
  ui.puzzleGeneratorOpen = false;
  router.push(`/puzzles/${puzzle.id}`);
}
</script>
