<template>
  <div class="space-y-4">
    <ProFeatureGate v-if="!isPro" message="Simulacrum forging is available on the Pro plan." />

    <p v-else-if="!campaign.isAiEnabled" class="font-fell text-sm text-muted-foreground italic">
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
        <div v-else class="flex h-full w-full items-center justify-center font-fell text-xs text-muted-foreground italic">
          No portrait
        </div>
      </div>

      <!-- Art direction is available BEFORE the first (paid) roll too — many
           source portraits carry very specific poses the mini shouldn't keep. -->
      <label class="block">
        <span class="text-eyebrow font-semibold text-muted-foreground">Art direction (optional)</span>
        <input
          v-model="instructions"
          type="text"
          placeholder="e.g. heroic action pose with sword raised, thicker staff, less clutter"
          class="mt-1 w-full bg-background border border-border rounded px-2.5 py-1.5 font-fell text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <p class="mt-1 font-fell text-2xs text-muted-foreground/70 italic">
          Describe the pose or details the mini should have — it doesn't have to match the portrait.
        </p>
      </label>

      <div class="flex flex-col items-center gap-1.5">
        <button
          type="button"
          :disabled="isStylizing || !sourcePortraitUrl || !affordable(stylizeCost)"
          class="inline-flex items-center justify-center gap-1.5 px-4 py-2 text-label-lg font-semibold rounded-md disabled:opacity-50 transition-opacity"
          :class="stylizedUrl
            ? 'border border-border hover:bg-muted text-foreground'
            : 'bg-primary text-primary-foreground hover:opacity-90'"
          @click="runStylize"
        >
          <IconGenerate class="h-3.5 w-3.5" :class="isStylizing ? 'animate-pulse text-primary' : ''" />
          {{ isStylizing ? (stylizedUrl ? 'Re-rolling…' : 'Stylizing…') : (stylizedUrl ? 'Re-roll' : 'Stylize portrait') }}
        </button>
        <GenerationCostBadge :credits="stylizeCost" :show-balance="false" />
      </div>

      <div v-if="stylizedUrl" class="flex justify-end pt-2 border-t border-border">
        <button
          type="button"
          class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity"
          @click="emit('continue')"
        >
          Continue to sculpt →
        </button>
      </div>

      <p v-if="error" class="font-fell text-xs text-destructive text-center">{{ error }}</p>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { IconGenerate } from "@/lib/icons";
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
const { stylize, isStylizing } = useMiniForge();

const instructions = ref("");
const error = ref<string | null>(null);
const stylizedUrl = computed(() => mini?.stylized_image_url ?? null);

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
    instructions.value = "";
    emit("stylized", updated);
  } catch (e) {
    error.value = e instanceof Error ? e.message : "Stylizing failed. Please try again.";
  }
}
</script>
