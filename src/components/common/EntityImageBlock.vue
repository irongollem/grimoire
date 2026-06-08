<template>
  <div class="flex flex-col gap-0">
    <!-- Variant tabs (e.g. True Form / Alter Ego, Identified / Mundane) -->
    <div v-if="variants && variants.length > 1" class="flex border-b border-border">
      <button
        v-for="variant in variants"
        :key="variant.id"
        type="button"
        class="px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border-b-2 transition-colors"
        :class="activeVariantId === variant.id
          ? 'border-primary text-primary'
          : 'border-transparent text-muted-foreground hover:text-foreground'"
        @click="emit('update:activeVariantId', variant.id)"
      >{{ variant.label }}</button>
    </div>

    <ImageUpload
      :model-value="modelValue || null"
      :focal-point="focalPoint"
      :bucket="bucket"
      :show-focal-point="showFocalPoint"
      :folder-prefix="folderPrefix"
      :disabled="disabled"
      @update:model-value="emit('update:modelValue', $event ?? '')"
      @update:focal-point="emit('update:focalPoint', $event)"
    />

    <!-- AI generation — only when the parent opts in and the campaign allows AI -->
    <div v-if="showAiButton" class="mt-2 flex flex-col gap-1">
      <button
        type="button"
        :disabled="isGenerating || disabled || !affordable(imageCost, imageByok)"
        class="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 font-cinzel text-[11px] font-semibold tracking-wider border border-border rounded-md hover:bg-muted disabled:opacity-50 transition-colors"
        @click="runGenerate"
      >
        <IconGenerate class="h-3.5 w-3.5" :class="isGenerating ? 'animate-pulse text-primary' : ''" />
        {{ isGenerating ? "Generating…" : (modelValue ? "Regenerate with AI" : "Generate with AI") }}
      </button>
      <div v-if="!isGenerating" class="flex justify-center">
        <GenerationCostBadge :credits="imageCost" :byok="imageByok" :show-balance="false" />
      </div>
      <p v-if="isGenerating" class="font-fell text-[11px] text-muted-foreground italic text-center">
        {{ currentLoadingQuote }}
      </p>
      <p v-if="error" class="font-fell text-[11px] text-destructive">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useEntityImageGeneration } from "@/ai/useEntityImageGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAiCredits } from "@/composables/useAiCredits";
import { useProviderConfig } from "@/composables/useProviderConfig";

export interface ImageVariant {
  id: string;
  label: string;
}

const {
  modelValue,
  bucket,
  disabled = false,
  aiKind,
  aiContext,
  aiTargetId,
} = defineProps<{
  modelValue: string | null | undefined;
  focalPoint?: { x: number; y: number } | null;
  bucket: string;
  showFocalPoint?: boolean;
  folderPrefix?: string;
  disabled?: boolean;
  variants?: ReadonlyArray<ImageVariant>;
  activeVariantId?: string;
  /** Image-job kind (npc_portrait, monster, item, …). Enables the "Generate with AI" button. */
  aiKind?: string;
  /** Entity facts the AI authors a prompt from. Button only shows when both aiKind + aiContext are set. */
  aiContext?: string;
  /** Source entity id — recorded on the Gallery row so generated art links back to its entity. */
  aiTargetId?: string | null;
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:focalPoint", value: { x: number; y: number } | null): void;
  (e: "update:activeVariantId", value: string): void;
}>();

const campaign = useCampaignStore();
const { isGenerating, error, generate } = useEntityImageGeneration(bucket);

// Entity portraits always render via OpenAI at 1024×1536 (portrait → 1.5× cost).
const { costOf, affordable } = useAiCredits();
const { imageMultiplierFor } = useProviderConfig();
const imageByok = computed(() => !!campaign.decryptedOpenAiKey);
const imageCost = computed(
  () => Math.round(costOf("entity_image", { size: "1024x1536" }) * imageMultiplierFor("openai") * 100) / 100,
);

const showAiButton = computed(
  () => !!aiKind && !!aiContext?.trim() && !disabled && campaign.isAiEnabled,
);

async function runGenerate() {
  if (!aiKind || !aiContext?.trim()) return;
  const url = await generate({ kind: aiKind, context: aiContext, targetId: aiTargetId ?? null });
  if (url) {
    emit("update:modelValue", url);
    // New art has no curated focal point yet — default to dead-center.
    emit("update:focalPoint", { x: 50, y: 50 });
  }
}
</script>
