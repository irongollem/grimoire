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
        <h2 class="font-cinzel text-base font-semibold text-foreground">Puzzle Generator</h2>
        <button class="text-muted-foreground hover:text-foreground" @click="ui.puzzleGeneratorOpen = false">
          <IconClose class="h-5 w-5" />
        </button>
      </div>

      <!-- Body -->
      <div class="flex-1 overflow-y-auto p-5 space-y-5">
        <!-- Concept -->
        <div>
          <label class="block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1.5">
            CONCEPT
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
          </label>
          <textarea
            v-model="concept"
            rows="4"
            :maxlength="CONCEPT_LIMIT"
            placeholder="A flooded crypt where water levels rise unless the players reroute flow through a series of ancient stone sluices…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
          <div class="flex justify-end mt-1">
            <span
              class="font-fell text-xs"
              :class="concept.length >= CONCEPT_LIMIT * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
            >{{ concept.length }} / {{ CONCEPT_LIMIT }}</span>
          </div>
        </div>

        <div class="gold-divider" />

        <!-- Constraints -->
        <div class="space-y-3">
          <p class="font-cinzel text-xs font-semibold tracking-wider text-muted-foreground">
            CONSTRAINTS
            <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
          </p>

          <div class="grid grid-cols-2 gap-2">
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Type</label>
              <select
                v-model="constraints.puzzle_type"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="t in PUZZLE_TYPES" :key="t" :value="t">{{ t }}</option>
              </select>
            </div>
            <div>
              <label class="block font-fell text-xs text-muted-foreground mb-1">Difficulty</label>
              <select
                v-model="constraints.difficulty"
                class="w-full bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
              >
                <option value="">Any</option>
                <option v-for="d in PUZZLE_DIFFICULTIES" :key="d" :value="d">{{ d }}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Image generation toggle -->
        <div v-if="aiApiKey" class="flex items-center justify-between">
          <span class="font-fell text-xs text-muted-foreground">Generate room illustration</span>
          <button
            type="button"
            class="relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none"
            :class="generateImage ? 'bg-primary' : 'bg-muted border border-border'"
            @click="generateImage = !generateImage"
          >
            <span
              class="inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform shadow-sm"
              :class="generateImage ? 'translate-x-4.5' : 'translate-x-0.5'"
            />
          </button>
        </div>

        <!-- No API key nudge -->
        <div v-if="isPro && !aiApiKey" class="rounded-md border border-border bg-muted/40 p-3">
          <p class="font-fell text-xs text-muted-foreground italic">
            Add an OpenAI key in
            <RouterLink
              to="/campaign/settings"
              class="text-primary hover:underline"
              @click="ui.puzzleGeneratorOpen = false"
            >
              Campaign Settings → AI Assistant
            </RouterLink>
            to unlock AI generation.
          </p>
        </div>

        <!-- Generating state -->
        <div v-else-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
          <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
          <p class="font-fell text-sm text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
          <button
            type="button"
            class="mt-1 font-fell text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            @click="ui.puzzleGeneratorOpen = false"
          >
            Continue in background
          </button>
        </div>

        <!-- Error -->
        <div
          v-else-if="genError"
          class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
        >
          <p class="font-fell text-xs text-destructive">{{ genError }}</p>
        </div>
      </div>

      <!-- Footer -->
      <div class="px-5 py-4 border-t border-border flex flex-col gap-2 shrink-0">
        <button
          v-if="isPro && aiApiKey"
          type="button"
          :disabled="isAnyAiGenerating || !concept.trim()"
          :title="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 disabled:opacity-50 transition-opacity"
          @click="generateAndCreate"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          {{ isGenerating ? "Generating…" : "Generate with AI" }}
        </button>
        <button
          v-else-if="!isPro"
          type="button"
          class="w-full inline-flex items-center justify-center gap-1.5 py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md bg-primary text-primary-foreground hover:opacity-90 transition-opacity"
          @click="showPaywall = true"
        >
          <IconGenerate class="h-3.5 w-3.5" />
          Generate with AI
        </button>
        <RouterLink
          to="/puzzles/new"
          class="w-full inline-flex items-center justify-center py-2 font-cinzel text-xs font-semibold tracking-wider rounded-md hover:opacity-90 transition-opacity"
          :class="isPro && !aiApiKey ? 'bg-primary text-primary-foreground' : 'border border-border bg-card text-foreground hover:bg-muted'"
          @click="ui.puzzleGeneratorOpen = false"
        >
          New Blank Puzzle
        </RouterLink>
      </div>
    </aside>
  </Transition>
  <PaywallModal v-model="showPaywall" message="AI generation is a Pro feature. Upgrade to generate puzzles, NPCs, monsters, items, spells, and session artwork." />
</template>

<script setup lang="ts">
import { ref, reactive, computed } from "vue";
import { AI_PROMPT_LIMIT } from "@/ai/utils";

const CONCEPT_LIMIT = AI_PROMPT_LIMIT;
import { useRouter, RouterLink } from "vue-router";
import { IconClose, IconGenerate } from '@/lib/icons';
import { useUiStore } from "@/stores/ui";
import { useCampaignStore } from "@/stores/campaign";
import { useCreatePuzzle } from "@/composables/usePuzzles";
import { useSubscription } from "@/composables/useSubscription";
import PaywallModal from "@/components/common/PaywallModal.vue";
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
const { isPro } = useSubscription();
const showPaywall = ref(false);

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
    campaign_id:         null,
    is_shared:           false,
    shared_hints:        [],
    read_aloud:          null,
  });

  completedEntityId.value = puzzle.id;
  ui.puzzleGeneratorOpen = false;
  router.push(`/puzzles/${puzzle.id}`);
}
</script>
