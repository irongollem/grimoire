<template>
  <AppModal :open="true" size="md" @close="emit('close')">
    <ModalHeader :title="heading" :icon="IconExport" tone="primary" closeable @close="emit('close')" />

    <div class="min-h-0 flex-1 space-y-4 overflow-y-auto overscroll-contain px-5 py-4">
      <!-- Working: the export runs in the editor, so this can be closed and writing can go on. -->
      <section v-if="isExporting" class="space-y-3" aria-label="Export progress" data-testid="export-progress">
        <p class="font-fell text-body font-semibold text-foreground">{{ pdfExportProgressLabel(progress) }}</p>
        <div class="h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden="true">
          <div class="h-full bg-primary transition-[width]" :style="{ width: `${barPercent}%` }" />
        </div>
        <p class="text-caption text-muted-foreground">
          A big book prints in parts and joins into one file on your computer. You can keep writing while it runs.
        </p>
      </section>

      <template v-else-if="step === 'confirm'">
        <p class="font-fell text-body text-foreground" data-testid="export-summary">{{ summary }}</p>
        <AppCheckbox
          v-if="campaignId"
          v-model="attach"
          label="Attach the campaign data"
          hint="Another DM can import the monsters, places and factions this book uses."
        />
      </template>

      <template v-else>
        <BundleEntityPicker
          v-if="phase !== 'details' && campaignId"
          :state="selection"
          :campaign-id="campaignId"
          title="What travels inside the PDF"
          finish-label="Continue to Details"
        />

        <template v-else>
          <div class="flex items-center gap-3">
            <AppButton variant="ghost" size="icon-xs" :icon="IconChevronLeft" aria-label="Back" @click="goBack" />
            <div>
              <p class="text-eyebrow font-semibold text-muted-foreground">Final step</p>
              <h3 class="text-heading-sm font-semibold text-foreground">Bundle Details</h3>
            </div>
          </div>

          <div class="space-y-3">
            <div>
              <label for="pdf-bundle-name" class="mb-1 block text-eyebrow font-semibold text-muted-foreground">
                Bundle Name
              </label>
              <AppInput id="pdf-bundle-name" v-model="bundleName" tone="muted" size="body" />
            </div>
            <div>
              <label for="pdf-bundle-description" class="mb-1 block text-eyebrow font-semibold text-muted-foreground">
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

          <div class="space-y-2 rounded-md border border-border bg-muted/30 px-4 py-3">
            <p class="text-eyebrow font-semibold text-muted-foreground">Inside the PDF</p>
            <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
              <template v-for="type in orderedCategories" :key="type">
                <span class="text-caption text-muted-foreground">{{ typeLabel(type) }}</span>
                <span class="text-right text-label-lg font-semibold text-foreground">
                  {{ entitySelections[type]?.size ?? 0 }}
                </span>
              </template>
            </div>
            <p class="pt-1 text-caption italic text-muted-foreground">
              Player visibility flags and party-member links are cleared on import. Re-saving the PDF
              through another app strips the embedded data, so share the downloaded file as-is.
            </p>
          </div>
        </template>
      </template>

      <p v-if="failure" class="text-caption text-destructive" role="alert">{{ failure }}</p>
    </div>

    <div v-if="isExporting" class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Keep writing" @click="emit('close')" />
    </div>
    <div v-else-if="step === 'confirm'" class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconExport"
        :label="attach ? 'Choose the data' : actionLabel"
        @click="onConfirm"
      />
    </div>
    <div v-else-if="phase === 'details'" class="flex shrink-0 justify-end gap-2 px-5 pb-5 pt-2">
      <AppButton variant="subtle" size="sm" label="Cancel" @click="emit('close')" />
      <AppButton
        variant="primary"
        size="sm"
        :icon="IconExport"
        :label="busy ? 'Gathering…' : 'Export PDF'"
        :loading="busy"
        :disabled="busy || totalSelected === 0 || !bundleName.trim()"
        @click="onExportWithData"
      />
    </div>
  </AppModal>
</template>

<script setup lang="ts">
/**
 * The one export dialog (#1115 frame 06): "All 15 chapters, in order, as one
 * PDF of 542 pages", an optional "Attach the campaign data" (the same bundle
 * picker as the World Bundle tab), and Export. For a handout the same dialog
 * says Print.
 *
 * The host mounts this when asked (`v-if`), so every open starts from the
 * preselection. The export itself runs in the editor (`run`), not here: it
 * carries on when this is closed.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppModal from "@/components/common/overlays/AppModal.vue";
import ModalHeader from "@/components/common/overlays/ModalHeader.vue";
import BundleEntityPicker from "@/components/campaign/BundleEntityPicker.vue";
import { IconChevronLeft, IconExport } from "@/lib/icons";
import { BUNDLE_ENTITY_TYPES, buildBundle } from "@/composables/campaign/useWorldBundle";
import type { BundleEntityKey, GrimoireBundle } from "@/composables/campaign/useWorldBundle";
import { useBundleAuthor, useBundleSelection } from "@/composables/campaign/useBundleSelection";
import type { BundleInitialSelection } from "@/composables/campaign/useBundleSelection";
import { pdfExportProgressLabel, type PdfExportProgress } from "@/composables/scriptorium/useScriptoriumPdf";
import type { ScriptoriumKind } from "@/types/scriptorium.types";

const {
  kind,
  documentTitle,
  chapterCount,
  pageCount,
  campaignId,
  preselection,
  run,
  isExporting = false,
  progress = null,
  exportError = null,
} = defineProps<{
  kind: ScriptoriumKind;
  documentTitle: string;
  chapterCount: number;
  /** Pages the layout made; null before the book has been laid out. */
  pageCount: number | null;
  /** The book's own campaign: the bundle is built from it, whichever campaign is active. */
  campaignId: string | null;
  preselection: BundleInitialSelection;
  /** Starts the export in the editor; true when the file was made. */
  run: (bundle?: GrimoireBundle) => Promise<boolean>;
  isExporting?: boolean;
  progress?: PdfExportProgress | null;
  exportError?: string | null;
}>();

const emit = defineEmits<{ close: [] }>();

const handout = computed(() => kind === "handout");
const heading = computed(() => (handout.value ? "Print" : "Export PDF"));
const actionLabel = computed(() => (handout.value ? "Print" : "Export"));

const summary = computed(() => {
  const pages =
    pageCount === null ? "" : ` of ${pageCount} ${pageCount === 1 ? "page" : "pages"}`;
  if (handout.value) return `This handout, as a PDF${pages}.`;
  const chapters = chapterCount === 1 ? "The one chapter" : `All ${chapterCount} chapters, in order,`;
  return `${chapters} as one PDF${pages}.`;
});

const step = ref<"confirm" | "data">("confirm");
const attach = ref(false);

const selection = useBundleSelection(preselection);
const { phase, orderedCategories, entitySelections, totalSelected, selectionMap, goBack } = selection;
const exportAuthor = useBundleAuthor();

const bundleName = ref(documentTitle);
const bundleDescription = ref("");
const building = ref(false);
const buildError = ref<string | null>(null);
const busy = computed(() => building.value || isExporting);
const failure = computed(() => buildError.value ?? exportError);

const barPercent = computed(() => {
  if (!progress || progress.total === 0) return 8;
  return Math.max(8, Math.round((progress.part / progress.total) * 100));
});

function typeLabel(key: BundleEntityKey): string {
  return BUNDLE_ENTITY_TYPES.find((t) => t.key === key)?.label ?? key;
}

async function onConfirm() {
  if (attach.value) {
    step.value = "data";
    return;
  }
  if (await run()) emit("close");
}

async function onExportWithData() {
  if (!campaignId) return;
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
    if (await run(bundle)) emit("close");
  } catch (err) {
    buildError.value = err instanceof Error ? err.message : "Could not gather the campaign data";
  } finally {
    building.value = false;
  }
}
</script>
