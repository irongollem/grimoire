<template>
  <div class="flex flex-col gap-0">
    <!-- Variant tabs (e.g. True Form / Alter Ego, Identified / Mundane) -->
    <div v-if="variants && variants.length > 1" class="flex border-b border-border">
      <button
        v-for="variant in variants"
        :key="variant.id"
        type="button"
        class="px-3 py-1.5 text-label-lg font-semibold border-b-2 transition-colors"
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
    <div v-if="showAiButton || showMiniButton" class="mt-2 flex flex-col gap-1">
      <div class="flex gap-1.5">
        <AppButton
          v-if="showAiButton"
          variant="outline"
          fill="muted"
          size="sm"
          class="flex-1"
          :disabled="isGenerating || disabled || !affordable(imageCost, imageByok)"
          @click="runGenerate"
        >
          <template #icon>
            <IconGenerate class="h-3.5 w-3.5" :class="isGenerating ? 'animate-pulse text-primary' : ''" />
          </template>
          {{ isGenerating ? "Generating…" : (modelValue ? "Regenerate with AI" : "Generate with AI") }}
        </AppButton>
        <AppButton
          v-if="showMiniButton"
          variant="outline"
          fill="muted"
          size="sm"
          class="shrink-0"
          tooltip="Forge a 3D mini from this portrait"
          label="Mini"
          @click="goToMiniForge"
        >
          <template #icon>
            <VitruvianIcon class="text-sm" />
          </template>
        </AppButton>
      </div>
      <div v-if="showAiButton && !isGenerating" class="flex justify-center">
        <GenerationCostBadge :credits="imageCost" :byok="imageByok" :show-balance="false" />
      </div>
      <p v-if="isGenerating" class="text-caption text-muted-foreground italic text-center">
        {{ currentLoadingQuote }}
      </p>
      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import VitruvianIcon from "@/components/common/VitruvianIcon.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useEntityImageGeneration } from "@/ai/useEntityImageGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useSimulacrumConfig } from "@/composables/simulacrum/useSimulacrumConfig";
import type { MiniSourceTable } from "@/types/mini.types";

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
  miniSource,
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
  /** Enables the "Mini" entry point into the Simulacrum forge wizard for this portrait. */
  miniSource?: { table: MiniSourceTable; id: string };
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

const router = useRouter();
const { isVisible: simulacrumVisible } = useSimulacrumConfig();
const showMiniButton = computed(
  () => !!miniSource && !!modelValue && simulacrumVisible.value && !disabled,
);

function goToMiniForge() {
  if (!miniSource) return;
  router.push({ path: "/minis/forge", query: { source: miniSource.table, id: miniSource.id } });
}

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
