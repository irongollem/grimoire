<template>
  <AppModal :open="true" size="md" @close="emit('close')">
    <ModalHeader
      title="PDF with campaign data"
      :icon="IconExport"
      tone="primary"
      closeable
      @close="emit('close')"
    />

    <div class="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 py-4 space-y-4">
      <BundleEntityPicker
        v-if="phase !== 'details'"
        :state="selection"
        :campaign-id="campaignId"
        title="What travels inside the PDF"
        finish-label="Continue to Details"
      />

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
            <p class="text-eyebrow font-semibold text-muted-foreground">Final step</p>
            <h3 class="text-heading-sm font-semibold text-foreground">Bundle Details</h3>
          </div>
        </div>

        <div class="space-y-3">
          <div>
            <label for="pdf-bundle-name" class="block text-eyebrow font-semibold text-muted-foreground mb-1">
              Bundle Name
            </label>
            <AppInput id="pdf-bundle-name" v-model="bundleName" tone="muted" size="body" />
          </div>
          <div>
            <label for="pdf-bundle-description" class="block text-eyebrow font-semibold text-muted-foreground mb-1">
              Description
            </label>
            <AppInput
              id="pdf-bundle-description"
              v-model="bundleDescription"
              tone="muted"
              size="body"
              placeholder="A brief description for whoever imports this PDF…"
            />
          </div>
        </div>

        <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
          <p class="text-eyebrow font-semibold text-muted-foreground">Inside the PDF</p>
          <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
            <template v-for="type in orderedCategories" :key="type">
              <span class="text-caption text-muted-foreground">{{ typeLabel(type) }}</span>
              <span class="text-label-lg font-semibold text-foreground text-right">
                {{ entitySelections[type]?.size ?? 0 }}
              </span>
            </template>
          </div>
          <p class="text-caption text-muted-foreground italic pt-1">
            Player visibility flags and party-member links are cleared on import. Re-saving the PDF
            through another app strips the embedded data, so share the downloaded file as-is.
          </p>
        </div>
      </template>

      <p v-if="failure" class="text-caption text-destructive">{{ failure }}</p>
    </div>

    <div v-if="phase === 'details'" class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconExport"
        :label="busy ? 'Building…' : 'Export PDF'"
        :loading="busy"
        :disabled="busy || totalSelected === 0 || !bundleName.trim()"
        @click="onExport"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * "PDF with campaign data" (#565): the DM picks which campaign entities travel
 * inside the exported PDF, using the same picker as the World Bundle tab. The
 * host mounts this when asked (`v-if`), so every open starts from the
 * preselection rather than a stale earlier choice.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import BundleEntityPicker from "@/components/campaign/BundleEntityPicker.vue";
import { IconChevronLeft, IconExport } from "@/lib/icons";
import { BUNDLE_ENTITY_TYPES, buildBundle } from "@/composables/campaign/useWorldBundle";
import type { BundleEntityKey } from "@/composables/campaign/useWorldBundle";
import { useBundleAuthor, useBundleSelection } from "@/composables/campaign/useBundleSelection";
import type { BundleInitialSelection } from "@/composables/campaign/useBundleSelection";
import { useScriptoriumPdf } from "@/composables/scriptorium/useScriptoriumPdf";
import type { PdfDocumentOptions } from "@/composables/scriptorium/useScriptoriumPdf";

const { campaignId, documentTitle, preselection, pdfOptions } = defineProps<{
  /** The document's own campaign: the bundle is built from it, whichever campaign is active. */
  campaignId: string;
  documentTitle: string;
  preselection: BundleInitialSelection;
  pdfOptions: PdfDocumentOptions;
}>();

const emit = defineEmits<{ close: [] }>();

const selection = useBundleSelection(preselection);
const { phase, orderedCategories, entitySelections, totalSelected, selectionMap, goBack } = selection;
const exportAuthor = useBundleAuthor();

const bundleName = ref(documentTitle);
const bundleDescription = ref("");

const { isExporting, exportError, exportPdf } = useScriptoriumPdf();
const building = ref(false);
const buildError = ref<string | null>(null);
const busy = computed(() => building.value || isExporting.value);
const failure = computed(() => buildError.value ?? exportError.value);

function typeLabel(key: BundleEntityKey): string {
  return BUNDLE_ENTITY_TYPES.find((t) => t.key === key)?.label ?? key;
}

async function onExport() {
  buildError.value = null;
  building.value = true;
  try {
    const bundle = await buildBundle({
      campaignId,
      name: bundleName.value.trim(),
      description: bundleDescription.value.trim(),
      author: exportAuthor(),
      selection: selectionMap.value,
    });
    building.value = false;
    const ok = await exportPdf({ ...pdfOptions, bundle });
    if (ok) emit("close");
  } catch (err) {
    buildError.value = err instanceof Error ? err.message : "Could not gather the campaign data";
  } finally {
    building.value = false;
  }
}
</script>
