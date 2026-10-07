<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-4">
    <div>
      <h4 class="text-heading-sm font-bold text-foreground">Extract details with AI</h4>
      <p class="text-caption text-muted-foreground">
        Optional. Your pages are already imported as they are. Tick the ones you want read by AI for stat blocks, quest
        beats and other details; you review everything it finds before anything is added.
      </p>
    </div>

    <p v-if="!isAiEnabled" class="text-caption italic text-muted-foreground">
      AI is turned off for this campaign, so this extra pass is not offered.
    </p>
    <p v-else-if="candidates.length === 0" class="text-caption italic text-muted-foreground">No pages were imported to read.</p>

    <template v-else>
      <div class="flex flex-wrap items-center justify-between gap-2">
        <span class="text-caption text-muted-foreground">{{ selected.size }} of {{ candidates.length }} ticked</span>
        <AppButton v-if="selected.size > 0" variant="ghost" size="inline" label="Clear" @click="selected = new Set()" />
      </div>

      <ul class="max-h-72 divide-y divide-border overflow-y-auto rounded-md border border-border">
        <li v-for="page in candidates.slice(0, shown)" :key="page.ref" class="px-3 py-1.5">
          <AppCheckbox
            :model-value="selected.has(page.ref)"
            size="md"
            :label="page.title"
            @update:model-value="(v: boolean) => toggle(page.ref, v)"
          />
        </li>
        <li v-if="candidates.length > shown" class="p-2">
          <AppButton variant="ghost" size="inline" :label="`Show ${Math.min(STEP, candidates.length - shown)} more`" @click="shown += STEP" />
        </li>
      </ul>

      <div v-if="selected.size > 0" class="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3">
        <p class="text-body text-foreground">
          {{ text.pages }} {{ text.pages === 1 ? "page" : "pages" }} of text
          <span class="text-caption text-muted-foreground">({{ text.chars.toLocaleString() }} characters, {{ planLabel }})</span>
        </p>
        <ProFeatureGate v-if="upsell" :message="upsell.message" />
        <p v-else-if="overCap" class="text-caption text-destructive">{{ overCap.message }}</p>
        <template v-else-if="costLoading">
          <p class="text-caption italic text-muted-foreground">Calculating cost…</p>
        </template>
        <template v-else-if="costErrored || !costEstimate">
          <p class="text-caption italic text-muted-foreground">Price unavailable</p>
        </template>
        <template v-else>
          <GenerationCostBadge :credits="costEstimate.totalCredits" />
          <p class="text-caption text-muted-foreground">
            {{ costEstimate.baseCredits }} base + {{ costEstimate.perPageCredits }} × {{ costEstimate.pageCount }} pages
          </p>
        </template>
      </div>

      <p v-if="error" class="text-caption text-destructive">{{ error }}</p>
      <div class="flex justify-end">
        <AppButton
          variant="primary"
          size="md"
          label="Extract details with AI"
          :icon="IconGenerate"
          :loading="starting"
          :disabled="selected.size === 0 || !!overCap || !!upsell || !costEstimate"
          @click="start"
        />
      </div>
    </template>
  </section>
</template>

<script setup lang="ts">
/**
 * The optional AI layer of a wiki-export import (#932), offered on the result
 * screen. The pages the DM ticks (none by default) are written out as one
 * markdown document and go through an ordinary `text` import, so the page
 * ceiling, the credit charge, the review and its dedupe (which will offer the
 * just-imported rows as links) all apply exactly as they do for a paste. The
 * archive import itself stays free and AI-free.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import { IconGenerate } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useOutOfCredits } from "@/composables/ai/useOutOfCredits";
import { useCreateDocumentImport, useImportCost, useStartExtraction } from "@/composables/campaign/useDocumentImport";
import { archiveAiText } from "@/lib/archiveImport/archiveAiText";
import { FREE_PAGE_LIMIT, PRO_PAGE_LIMIT, validateTextImport } from "@/lib/documentImport/limits";
import type { ArchivePage } from "@/lib/archiveImport/types";

const { candidates, displayName } = defineProps<{
  /** The pages this import created, which the DM may send to AI. */
  candidates: readonly ArchivePage[];
  displayName: string;
}>();

const STEP = 100;

const campaign = useCampaignStore();
const isAiEnabled = computed(() => campaign.isAiEnabled);
const toast = useToast();
const { isPro } = useSubscription();
const { requireCredits } = useOutOfCredits();
const createImport = useCreateDocumentImport();
const startExtraction = useStartExtraction();

const selected = ref(new Set<string>());
const shown = ref(STEP);
const starting = ref(false);
const error = ref<string | null>(null);

function toggle(ref: string, on: boolean): void {
  const next = new Set(selected.value);
  if (on) next.add(ref);
  else next.delete(ref);
  selected.value = next;
}

const text = computed(() => archiveAiText(candidates.filter((page) => selected.value.has(page.ref))));
const planLabel = computed(() => `up to ${isPro.value ? PRO_PAGE_LIMIT : FREE_PAGE_LIMIT} pages on your plan`);

const validation = computed(() => (text.value.chars > 0 ? validateTextImport(text.value.chars, isPro.value) : null));
const failure = computed(() => (validation.value && !validation.value.ok ? validation.value : null));
const upsell = computed(() => (failure.value?.reason === "too_many_pages" && !isPro.value ? failure.value : null));
const overCap = computed(() => (failure.value && !upsell.value ? failure.value : null));

const { estimate: costEstimate, isLoading: costLoading, isError: costErrored } = useImportCost(() => text.value.pages);

async function start(): Promise<void> {
  if (!costEstimate.value || !requireCredits(costEstimate.value.totalCredits)) return;
  starting.value = true;
  error.value = null;
  try {
    const row = await createImport.mutateAsync({
      files: [],
      sourceKind: "text",
      sourceText: text.value.text,
      displayName: `${displayName} (selected pages)`,
      pageCount: text.value.pages,
      // The DM attested to this material when they started the wiki import.
      rightsAttested: true,
    });
    const outcome = await startExtraction.mutateAsync(row.id);
    if (outcome.warning) toast.info(outcome.warning, 8000);
  } catch (err) {
    error.value = toast.fromError(err, "Could not start the extraction.");
  } finally {
    starting.value = false;
  }
}
</script>
