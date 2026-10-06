<template>
  <div class="max-w-xl space-y-6">

    <!-- Steps 1 and 2: shared with Scriptorium's "PDF with campaign data" dialog -->
    <BundleEntityPicker
      v-if="phase !== 'details'"
      :state="selection"
      :campaign-id="campaignStore.activeCampaignId"
    >
      <template #categories-actions>
        <AppButton
          variant="outline"
          size="md"
          label="Import .grimoire"
          :icon="IconUpload"
          @click="importOpen = true"
        />
      </template>
    </BundleEntityPicker>

    <!-- ── Phase: Metadata + Export ────────────────────────────────────────── -->
    <template v-else>
      <div class="flex items-center gap-3">
        <AppButton
          variant="ghost"
          size="icon-xs"
          :icon="IconChevronLeft"
          aria-label="Back"
          @click="goBack"
        />
        <div>
          <p class="text-eyebrow font-semibold text-muted-foreground">
            Final step
          </p>
          <h3 class="text-heading-sm font-semibold text-foreground">Bundle Details</h3>
        </div>
      </div>

      <div class="space-y-3">
        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
            Bundle Name *
          </label>
          <AppInput
            v-model="bundleName"
            tone="muted"
            size="body"
            placeholder="e.g. The Sunken Duchy"
          />
        </div>

        <div>
          <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">
            Description
          </label>
          <textarea
            v-model="bundleDescription"
            rows="2"
            placeholder="A brief description for whoever imports this bundle…"
            class="w-full bg-muted border border-border rounded-md px-3 py-2 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring resize-none"
          />
        </div>
      </div>

      <!-- Selection summary -->
      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
        <p class="text-eyebrow font-semibold text-muted-foreground">
          Bundle Contents
        </p>
        <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <template v-for="type in orderedCategories" :key="type">
            <span class="text-caption text-muted-foreground">
              {{ typeDef(type)?.label }}
            </span>
            <span class="text-label-lg font-semibold text-foreground text-right">
              {{ entitySelections[type]?.size ?? 0 }}
            </span>
          </template>
        </div>
        <p class="text-caption text-muted-foreground italic pt-1">
          Player visibility flags and party-member links are cleared on import.
        </p>
      </div>

      <!-- Output options explainer -->
      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-1.5">
        <div class="flex items-center gap-1.5">
          <p class="text-eyebrow font-semibold text-muted-foreground">Two ways to share</p>
          <ManualHelpLink page="sharing-adventures-as-pdfs" tooltip="DM Manual: Sharing Adventures as PDFs" />
        </div>
        <p class="text-caption text-muted-foreground">
          <strong class="text-foreground">Export .grimoire</strong> downloads the bundle as a file
          another DM can import directly into their campaign.
        </p>
        <p class="text-caption text-muted-foreground">
          <strong class="text-foreground">PDF with campaign data</strong> is made in the Scriptorium:
          open a book, choose the menu beside PDF, and pick what travels inside. You get one
          shareable file that reads like a normal PDF and imports as campaign content.
        </p>
      </div>

      <p v-if="exportError" class="text-caption text-destructive">{{ exportError }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <AppButton
          variant="subtle"
          size="md"
          label="Back"
          @click="goBack"
        />
        <AppButton
          variant="primary"
          size="md"
          :label="isExporting ? 'Exporting…' : 'Export .grimoire'"
          :icon="IconDownload"
          :disabled="isExporting || !bundleName.trim() || totalSelected === 0"
          @click="doExport"
        />
      </div>
    </template>

    <ImportBundleModal v-model="importOpen" />
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";
import { IconChevronLeft, IconDownload, IconUpload } from "@/lib/icons";
import { useCampaignStore } from "@/stores/campaign";
import { BUNDLE_ENTITY_TYPES, useExportWorldBundle } from "@/composables/campaign/useWorldBundle";
import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import { useBundleAuthor, useBundleSelection } from "@/composables/campaign/useBundleSelection";
import BundleEntityPicker from "@/components/campaign/BundleEntityPicker.vue";
import ImportBundleModal from "@/components/campaign/ImportBundleModal.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";

const campaignStore = useCampaignStore();
const exportAuthor = useBundleAuthor();

const selection = useBundleSelection();
const { phase, orderedCategories, entitySelections, totalSelected, selectionMap, goBack } = selection;

const bundleName = ref("");
const bundleDescription = ref("");
const importOpen = ref(false);
const exportError = ref<string | null>(null);

const { mutateAsync: runExport, isPending: isExporting } = useExportWorldBundle();

function typeDef(key: BundleEntityKey) {
  return BUNDLE_ENTITY_TYPES.find((t) => t.key === key);
}

async function doExport() {
  const campaignId = campaignStore.activeCampaignId;
  if (!campaignId) return;
  exportError.value = null;
  try {
    await runExport({
      campaignId,
      name: bundleName.value.trim(),
      description: bundleDescription.value.trim(),
      author: exportAuthor(),
      selection: selectionMap.value,
    });
  } catch (err) {
    exportError.value = err instanceof Error ? err.message : "Export failed";
  }
}
</script>
