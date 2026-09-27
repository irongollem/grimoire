<template>
  <div class="flex flex-col gap-0">
    <!-- Variant tabs (e.g. True Form / Alter Ego, Identified / Mundane, Picture / Cutout) -->
    <SegmentedControl
      v-if="variants && variants.length > 1"
      :model-value="activeVariantId ?? variants[0].id"
      :options="variantOptions"
      block
      size="sm"
      @update:model-value="emit('update:activeVariantId', $event)"
    />

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

    <!-- Cutout-slot warning (#917 story 2): a definite (non-null) transparency
         check found none. Never shown on `null` (the check couldn't run) — see
         imageHasTransparency's own doc for why that's kept apart from `false`. -->
    <p v-if="hasTransparency === false" class="text-caption text-muted-foreground italic">
      This image has no transparent background, so it will print as a rectangle on the page.
    </p>

    <!-- AI generation — only when the parent opts in and the campaign allows AI -->
    <div v-if="showAiButton || showMiniButton || showCutoutButton" class="mt-2 flex flex-col gap-1">
      <div class="flex gap-1.5">
        <AppButton
          v-if="showAiButton"
          variant="outline"
          fill="muted"
          size="sm"
          class="flex-1"
          :disabled="isGenerating || disabled"
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
        <!-- Cutout tab only (#917 story 5): makes the cutout FROM the entity's
             existing picture, so it never competes with "Generate with AI"/"Mini"
             for room in this row — the parent only sets cutoutFrom there. -->
        <AppButton
          v-if="showCutoutButton"
          variant="outline"
          fill="muted"
          size="sm"
          class="flex-1"
          :disabled="cutoutDisabled"
          :tooltip="cutoutFrom!.hasPicture ? undefined : 'Add a picture first'"
          @click="runCutoutGenerate"
        >
          <template #icon>
            <IconGenerate class="h-3.5 w-3.5" :class="isCutoutGenerating ? 'animate-pulse text-primary' : ''" />
          </template>
          {{ isCutoutGenerating ? "Cutting out…" : "Cut out from picture" }}
        </AppButton>
      </div>
      <div v-if="(showAiButton && !isGenerating) || (showCutoutButton && !isCutoutGenerating)" class="flex justify-center">
        <GenerationCostBadge v-if="showAiButton && !isGenerating" :credits="imageCost" :byok="imageByok" :show-balance="false" />
        <GenerationCostBadge v-if="showCutoutButton && !isCutoutGenerating" :credits="cutoutCost" :byok="false" :show-balance="false" />
      </div>
      <p v-if="isGenerating || isCutoutGenerating" class="text-caption text-muted-foreground italic text-center">
        {{ currentLoadingQuote }}
      </p>
      <p v-if="error || cutoutError" class="text-caption text-destructive">{{ error || cutoutError }}</p>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import VitruvianIcon from "@/components/common/VitruvianIcon.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useEntityImageGeneration } from "@/ai/useEntityImageGeneration";
import { useCutoutGeneration, type CutoutTable } from "@/ai/useCutoutGeneration";
import { currentLoadingQuote } from "@/ai/aiGenerationState";
import { useAiCredits } from "@/composables/ai/useAiCredits";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useProviderConfig } from "@/composables/ai/useProviderConfig";
import { useSimulacrumConfig } from "@/composables/simulacrum/useSimulacrumConfig";
import { imageHasTransparency } from "@/lib/mediaConvert";
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
  variants,
  expectTransparency = false,
  cutoutFrom,
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
  /** Cutout slots (#917 story 2) warn when the uploaded image has no
   *  transparent background — it would print as a plain rectangle. */
  expectTransparency?: boolean;
  /** Enables "Cut out from picture" (#917 story 5) — the parent sets this only
   *  on its own Cutout tab, for an entity kind/id `generate-cutout` supports.
   *  `hasPicture` disables the button (with a tooltip) until there's a
   *  picture to generate the cutout from. */
  cutoutFrom?: { table: CutoutTable; id: string; hasPicture: boolean };
}>();

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:focalPoint", value: { x: number; y: number } | null): void;
  (e: "update:activeVariantId", value: string): void;
}>();

const variantOptions = computed(() => (variants ?? []).map((v) => ({ value: v.id, label: v.label })));

// null = no check has resolved yet, or the check couldn't run (see
// imageHasTransparency's own doc) — both read as "no warning".
const hasTransparency = ref<boolean | null>(null);

watch(
  () => modelValue,
  async (url) => {
    if (!expectTransparency || !url) {
      hasTransparency.value = null;
      return;
    }
    const checkedUrl = url;
    const result = await imageHasTransparency(checkedUrl);
    // The url may have changed while the check was in flight — a stale
    // result must not overwrite whatever the current url's own check finds.
    if (checkedUrl === modelValue) hasTransparency.value = result;
  },
  { immediate: true },
);

const campaign = useCampaignStore();
const { isGenerating, error, generate } = useEntityImageGeneration(bucket);

// Entity portraits always render via OpenAI at 1024×1536 (portrait → 1.5× cost).
const { costOf } = useAiCredits();
const { requireCredits } = useOutOfCredits();
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

// Cutout generation (#917 story 5) — always OpenAI at the same portrait size
// as an entity image, and never BYOK (generate-cutout is platform-keys-only,
// like Simulacrum), so the cost badge never reads the campaign's own key.
const { isGenerating: isCutoutGenerating, error: cutoutError, generate: generateCutout } = useCutoutGeneration();
const cutoutCost = computed(
  () => Math.round(costOf("entity_cutout", { size: "1024x1536" }) * imageMultiplierFor("openai") * 100) / 100,
);
const showCutoutButton = computed(() => !!cutoutFrom && !disabled && campaign.isAiEnabled);
const cutoutDisabled = computed(() => isCutoutGenerating.value || disabled || !cutoutFrom?.hasPicture);

async function runCutoutGenerate() {
  if (!cutoutFrom) return;
  if (!requireCredits(cutoutCost.value, false)) return;
  const url = await generateCutout({ table: cutoutFrom.table, id: cutoutFrom.id, bucket });
  if (url) emit("update:modelValue", url);
}

async function runGenerate() {
  if (!aiKind || !aiContext?.trim()) return;
  if (!requireCredits(imageCost.value, imageByok.value)) return;
  const url = await generate({ kind: aiKind, context: aiContext, targetId: aiTargetId ?? null });
  if (url) {
    emit("update:modelValue", url);
    // New art has no curated focal point yet — default to dead-center.
    emit("update:focalPoint", { x: 50, y: 50 });
  }
}
</script>
