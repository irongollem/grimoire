<template>
  <p v-if="charCount === 0" class="text-caption text-muted-foreground italic">{{ emptyHint }}</p>
  <ProFeatureGate v-else-if="pageCapUpsell" :message="pageCapUpsell.message" />
  <p v-else-if="validationFailure" class="text-caption text-destructive">{{ validationFailure.message }}</p>
  <div v-else class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
    <p class="text-body text-foreground">{{ pageCount }} {{ pageCount === 1 ? "page" : "pages" }}</p>
    <template v-if="costLoading">
      <p class="text-caption text-muted-foreground italic">Calculating cost…</p>
    </template>
    <template v-else-if="costErrored || !costEstimate">
      <p class="text-caption text-muted-foreground italic">Price unavailable</p>
    </template>
    <template v-else>
      <GenerationCostBadge :credits="costEstimate.totalCredits" />
      <p class="text-caption text-muted-foreground">
        {{ costEstimate.baseCredits }} base + {{ costEstimate.perPageCredits }} × {{ costEstimate.pageCount }} pages
      </p>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * What a text import would cost and whether it fits: the page count and price, or the plan's page cap said out
 * loud. The paste step and the Scriptorium book step (#1226) both end on it, so the two cannot word the same cap
 * differently. Judging the size stays with the parent, which needs the verdict to enable its own button.
 */
import { computed } from "vue";
import GenerationCostBadge from "@/components/common/ai/GenerationCostBadge.vue";
import ProFeatureGate from "@/components/billing/ProFeatureGate.vue";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useImportCost } from "@/composables/campaign/useDocumentImport";
import type { UploadValidationResult } from "@/lib/documentImport/limits";

const { charCount, pageCount, validation, emptyHint } = defineProps<{
  charCount: number;
  pageCount: number;
  validation: UploadValidationResult | null;
  /** Said while there is nothing to size yet. */
  emptyHint: string;
}>();

const { isPro } = useSubscription();
const { estimate: costEstimate, isLoading: costLoading, isError: costErrored } = useImportCost(() => pageCount);

const validationFailure = computed(() => (validation && !validation.ok ? validation : null));
const pageCapUpsell = computed(() =>
  validationFailure.value?.reason === "too_many_pages" && !isPro.value ? validationFailure.value : null,
);
</script>
