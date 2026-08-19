<template>
  <div class="space-y-4">
    <ProFeatureGate v-if="!isPro" message="Simulacrum forging is available on the Pro plan." />

    <p v-else-if="!campaign.isAiEnabled" class="text-body text-muted-foreground italic">
      AI features are disabled for this campaign — ask your DM to enable them in campaign settings.
    </p>

    <template v-else>
      <!-- Stylized result, or the source portrait before the first roll -->
      <div class="aspect-square w-full max-w-xs mx-auto overflow-hidden rounded-lg border border-border bg-muted">
        <img
          v-if="stylizedUrl"
          :src="stylizedUrl"
          alt="Stylized render"
          class="h-full w-full object-cover"
        />
        <img
          v-else-if="sourcePortraitUrl"
          :src="sourcePortraitUrl"
          alt="Source portrait"
          class="h-full w-full object-cover"
        />
        <div v-else class="flex h-full w-full items-center justify-center text-caption text-muted-foreground italic">
          No portrait
        </div>
      </div>

      <!-- Art direction is available BEFORE the first (paid) roll too — many
           source portraits carry very specific poses the mini shouldn't keep. -->
      <label class="block">
        <span class="text-eyebrow font-semibold text-muted-foreground">Art direction (optional)</span>
        <AppInput
          v-model="instructions"
          type="text"
          tone="default"
          size="body"
          class="mt-1"
          placeholder="e.g. heroic action pose with sword raised, thicker staff, less clutter"
        />
        <p class="mt-1 text-caption-sm text-muted-foreground/70 italic">
          Describe the pose or details the mini should have — it doesn't have to match the portrait.
        </p>
      </label>

      <div class="flex flex-col items-center gap-1.5">
        <AppButton
          :variant="stylizedUrl ? 'outline' : 'primary'"
          :fill="stylizedUrl ? 'muted' : 'none'"
          size="md"
          :disabled="isStylizing || isResumingStylize || !sourcePortraitUrl || !affordable(stylizeCost)"
          :label="(isStylizing || isResumingStylize) ? (stylizedUrl ? 'Re-rolling…' : 'Stylizing…') : (stylizedUrl ? 'Re-roll' : 'Stylize portrait')"
          @click="runStylize"
        >
          <template #icon>
            <IconGenerate class="h-3.5 w-3.5" :class="(isStylizing || isResumingStylize) ? 'animate-pulse text-primary' : ''" />
          </template>
        </AppButton>
        <GenerationCostBadge :credits="stylizeCost" :show-balance="false" />
      </div>

      <div v-if="stylizedUrl && !isResumingStylize" class="flex justify-end pt-2 border-t border-border">
        <AppButton
          variant="primary"
          size="md"
          label="Continue to sculpt →"
          @click="emit('continue')"
        />
      </div>

      <p v-if="error" class="text-caption text-destructive text-center">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconGenerate } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import { useSubscription } from "@/composables/useSubscription";
import { useCampaignStore } from "@/stores/campaign";
import { useAiCredits } from "@/composables/useAiCredits";
import { useMiniForge } from "@/ai/useMiniForge";
import type { Mini, MiniFormat, MiniSourceTable } from "@/types/mini.types";

const { mini, sourcePortraitUrl, sourceTable, sourceId, format, campaignId } = defineProps<{
  mini: Mini | null;
  sourcePortraitUrl: string | null;
  sourceTable: MiniSourceTable;
  sourceId: string;
  format: MiniFormat;
  campaignId: string;
}>();

const emit = defineEmits<{
  stylized: [Mini];
  continue: [];
}>();

const { isPro } = useSubscription();

const campaign = useCampaignStore();
const { costOf, affordable } = useAiCredits();
const { stylize, waitForStylize, isStylizing } = useMiniForge();

const instructions = ref("");
const error = ref<string | null>(null);
const stylizedUrl = computed(() => mini?.stylized_image_url ?? null);
const isResumingStylize = ref(false);
const observedJobId = ref<string | null>(null);

// Stylize always runs at 1024x1024 (square baseline, so no size multiplier).
const stylizeCost = computed(() => costOf("entity_image", { size: "1024x1024" }));

async function runStylize() {
  error.value = null;
  try {
    const updated = await stylize({
      campaign_id: campaignId,
      source_table: sourceTable,
      source_id: sourceId,
      format,
      mini_id: mini?.id,
      instructions: instructions.value.trim() || undefined,
    });
    if (!updated) return; // user declined the likeness notice — abort silently
    instructions.value = "";
    emit("stylized", updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Stylizing failed. Please try again.";
  }
}

// An active job belongs to the mini, not this component. Pick it up whenever
// the forge is reopened (or Realtime updates the resumed mini) instead of
// letting navigation turn a paid render into an indistinguishable retry.
watch(
  () => mini?.stylize_job_id ?? null,
  (jobId) => {
    if (!jobId || jobId === observedJobId.value) return;
    observedJobId.value = jobId;
    isResumingStylize.value = true;
    error.value = null;
    void waitForStylize(mini!.id, jobId)
      .then((updated) => emit("stylized", updated))
      .catch((e) => {
        error.value = e instanceof Error ? e.message : "Stylizing failed. Please try again.";
      })
      .finally(() => { isResumingStylize.value = false; });
  },
  { immediate: true },
);
</script>
