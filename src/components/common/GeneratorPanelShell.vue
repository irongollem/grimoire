<template>
  <GeneratorPanelFrame :open="open" :title="title" @close="open = false">
    <!-- Results step (roll/loot tables, encounters): replaces the whole form -->
    <slot v-if="showResults" name="results" />

    <template v-else>
      <!-- Concept -->
      <div>
        <label class="block text-label-lg font-semibold text-muted-foreground mb-1.5">
          CONCEPT
          <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(AI will use this)</span>
        </label>
        <textarea
          v-model="concept"
          rows="4"
          :maxlength="conceptLimit"
          :placeholder="conceptPlaceholder"
          class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
        />
        <div class="flex justify-end mt-1">
          <span
            class="text-caption"
            :class="concept.length >= conceptLimit * 0.9 ? 'text-destructive' : 'text-muted-foreground/50'"
          >{{ concept.length }} / {{ conceptLimit }}</span>
        </div>
      </div>

      <div class="gold-divider" />

      <!-- Constraints -->
      <div v-if="$slots.constraints" class="space-y-3">
        <p class="text-label-lg font-semibold text-muted-foreground">
          CONSTRAINTS
          <span class="font-fell normal-case tracking-normal text-muted-foreground/60 ml-1">(optional)</span>
        </p>
        <slot name="constraints" />
      </div>

      <!-- Image generation toggle -->
      <div v-if="imageToggleLabel && campaign.isAiEnabled" class="flex items-center justify-between">
        <span class="text-caption text-muted-foreground">{{ imageToggleLabel }}</span>
        <ToggleSwitch v-model="generateImage" :aria-label="imageToggleLabel" />
      </div>

      <slot name="extra" />

      <!-- A paid result whose save failed: keep it, offer a save-only retry -->
      <div
        v-if="unsavedLabel"
        class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2 space-y-1"
        role="alert"
      >
        <p class="text-caption text-destructive">
          The generated {{ unsavedLabel }} could not be saved. Save it again, or discard it and generate a new one.
        </p>
        <AppButton variant="ghost" size="inline-caption" class="underline underline-offset-2" label="Discard" @click="emit('discard')" />
      </div>

      <!-- Generating state -->
      <div v-if="isGenerating" class="flex flex-col items-center gap-3 py-4">
        <IconGenerate class="h-7 w-7 text-primary animate-pulse" />
        <p class="text-body text-muted-foreground italic text-center">{{ currentLoadingQuote }}</p>
        <AppButton
          variant="ghost"
          size="inline-caption"
          class="mt-1 underline underline-offset-2"
          label="Continue in background"
          @click="open = false"
        />
      </div>

      <!-- Error -->
      <div
        v-else-if="error"
        class="rounded-md bg-destructive/10 border border-destructive/30 px-3 py-2"
      >
        <p class="text-caption text-destructive">{{ error }}</p>
      </div>
    </template>

    <template #footer>
      <!-- Results footer (Create / View buttons) -->
      <slot v-if="showResults" name="results-footer" />

      <template v-else>
        <GenerationCostBadge
          v-if="campaign.isAiEnabled && !unsavedLabel"
          :credits="credits"
          :byok="byok"
          class="self-center"
        />
        <!-- Saving a paid result costs nothing and needs no AI: it survives AI being switched off. -->
        <AppButton
          v-if="campaign.isAiEnabled || unsavedLabel"
          variant="primary"
          size="md"
          block
          :icon="IconGenerate"
          :disabled="isAnyAiGenerating || isSaving || (!unsavedLabel && (!concept.trim() || !canGenerate))"
          :loading="isSaving"
          :tooltip="isAnyAiGenerating && !isGenerating ? 'Another generation is already in progress' : undefined"
          :label="unsavedLabel ? 'Save again' : isGenerating ? 'Generating…' : generateLabel"
          @click="emit('generate')"
        />
        <AiOffNotice v-else />
        <AppButton
          v-if="blankTo && blankLabel"
          :to="blankTo"
          :variant="!campaign.isAiEnabled && !unsavedLabel ? 'primary' : 'outline'"
          size="md"
          block
          :label="blankLabel"
          @click="open = false"
        />
      </template>
    </template>
  </GeneratorPanelFrame>
</template>

<script setup lang="ts">
/**
 * The standard concept -> generate form, built on `GeneratorPanelFrame` (the
 * Frame is the chrome: overlay, slide-in panel, header, footer bar). The Shell
 * adds the concept box with its counter, constraints section, optional image
 * toggle, generating/error states, cost badge, Generate button, AI-off notice
 * and the "New Blank X" link. A new panel uses the Shell and supplies only its
 * own constraints, state and generate handler. Use the Frame directly only
 * when the panel has a form the Shell cannot express (its own concept box,
 * a second footer action); never hand-copy the skeleton again.
 *
 * Slots: `constraints` (under the CONSTRAINTS heading, heading omitted when
 * empty) and `extra` (after the image toggle, before the generating state).
 * A panel with a results step passes `show-results` while it holds a result:
 * the `results` slot then replaces the whole form and `results-footer`
 * replaces the Generate footer, all inside the same Frame instance.
 *
 * `unsavedLabel` marks a paid result whose save failed: the notice shows, the
 * primary button reads "Save again" (still emits `generate`; the panel decides
 * it means a save-only retry), the cost badge hides, and Discard emits `discard`.
 */
import { AI_PROMPT_LIMIT } from "@/ai/utils";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { isAnyAiGenerating } from "@/ai/aiGeneratorRegistry";
import GeneratorPanelFrame from "@/components/common/GeneratorPanelFrame.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import AiOffNotice from "@/components/common/AiOffNotice.vue";
import AppButton from "@/components/common/AppButton.vue";
import ToggleSwitch from "@/components/common/ToggleSwitch.vue";

const {
  title,
  conceptPlaceholder,
  conceptLimit = AI_PROMPT_LIMIT,
  credits,
  byok,
  isGenerating,
  error,
  blankTo,
  blankLabel,
  imageToggleLabel,
  showResults = false,
  canGenerate = true,
  generateLabel = "Generate with AI",
  unsavedLabel = null,
  isSaving = false,
} = defineProps<{
  title: string;
  conceptPlaceholder: string;
  conceptLimit?: number;
  credits: number;
  byok: boolean;
  isGenerating: boolean;
  error: string | null;
  blankTo?: string;
  blankLabel?: string;
  imageToggleLabel?: string;
  showResults?: boolean;
  canGenerate?: boolean;
  generateLabel?: string;
  /** Names a generated result whose save failed ("feature"). While set, the primary button becomes "Save again". */
  unsavedLabel?: string | null;
  isSaving?: boolean;
}>();

const open = defineModel<boolean>("open", { required: true });
const concept = defineModel<string>("concept", { required: true });
const generateImage = defineModel<boolean>("generateImage", { default: false });

const emit = defineEmits<{ generate: []; discard: [] }>();

const campaign = useCampaignStore();
</script>
