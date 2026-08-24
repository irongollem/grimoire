<template>
  <div class="max-w-xl space-y-6">
    <LoadingSpinner v-if="isLoadingActive" />

    <!-- ── Review: hand off to the wizard entirely ─────────────────────────── -->
    <DocumentImportWizard
      v-else-if="reviewRow"
      :import-row="reviewRow"
      @finished="onWizardFinished"
    />

    <!-- ── Extracting: server-side progress, no action to offer ───────────── -->
    <template v-else-if="extractingRow">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Extracting…</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          Reading "{{ extractingRow.display_name }}" ({{ pageLabel(extractingRow.page_count) }}).
        </p>
      </div>
      <LoadingSpinner message="This can take a minute — you can leave this tab, extraction keeps running." />
    </template>

    <!-- ── Pending: uploaded, not yet extracted ────────────────────────────── -->
    <template v-else-if="pendingRow">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Ready to extract</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          "{{ pendingRow.display_name }}" is uploaded and waiting to be read.
        </p>
      </div>

      <div class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
        <div class="flex items-center gap-2 text-body text-foreground">
          <component :is="pendingRow.source_kind === 'pdf' ? IconDocument : IconImages" class="h-4 w-4 text-muted-foreground shrink-0" />
          <span>{{ pageLabel(pendingRow.page_count) }}</span>
        </div>
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

      <p v-if="pendingStartError" class="text-caption text-destructive">{{ pendingStartError }}</p>
      <p v-if="abandonError" class="text-caption text-destructive">{{ abandonError }}</p>

      <div class="flex justify-end gap-2 pt-2">
        <AppButton
          variant="destructive"
          size="md"
          label="Abandon"
          :icon="IconDelete"
          :disabled="abandonImport.isPending.value"
          @click="abandonPending(pendingRow)"
        />
        <AppButton
          variant="primary"
          size="md"
          label="Start extraction"
          :icon="IconGenerate"
          :loading="startExtraction.isPending.value"
          :disabled="!costEstimate || !affordable(costEstimate.totalCredits)"
          @click="onStartExtraction(pendingRow)"
        />
      </div>
    </template>

    <!-- ── Failed: local fallback, or (defensively) a live row ─────────────── -->
    <template v-else-if="failedView">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Import failed</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          "{{ failedView.displayName }}" could not be extracted.
        </p>
      </div>
      <p class="text-caption text-destructive">{{ failedView.error }}</p>
      <p v-if="abandonError" class="text-caption text-destructive">{{ abandonError }}</p>
      <div class="flex justify-end pt-2">
        <AppButton
          variant="destructive"
          size="md"
          label="Discard and retry"
          :icon="IconDelete"
          :disabled="abandonImport.isPending.value"
          @click="discardFailedImport(failedView)"
        />
      </div>
    </template>

    <!-- ── Complete: local fallback, or (defensively) a live row ───────────── -->
    <template v-else-if="completeView">
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Import complete</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          "{{ completeView.displayName }}" has been added to your campaign.
        </p>
      </div>
      <div v-if="hasImportedCounts(completeView)" class="rounded-md border border-border bg-muted/30 px-4 py-3">
        <div class="grid grid-cols-2 gap-x-6 gap-y-0.5">
          <template v-for="kind in IMPORT_ENTITY_KINDS" :key="kind">
            <template v-if="(completeView.importedCounts?.[kind] ?? 0) > 0">
              <span class="text-caption text-muted-foreground">{{ KIND_LABELS[kind] }}</span>
              <span class="font-cinzel text-xs font-semibold text-foreground text-right">
                {{ completeView.importedCounts?.[kind] }}
              </span>
            </template>
          </template>
        </div>
      </div>
      <div class="flex justify-end pt-2">
        <AppButton variant="primary" size="md" label="Start a new import" :icon="IconRefresh" @click="startNewImport" />
      </div>
    </template>

    <!-- ── Upload step ──────────────────────────────────────────────────────── -->
    <template v-else>
      <div>
        <h3 class="font-cinzel text-sm font-semibold text-foreground">Document Import</h3>
        <p class="text-body text-muted-foreground italic mt-1">
          Import from a PDF or page photos.
        </p>
      </div>

      <p class="text-caption text-muted-foreground">
        <template v-if="isPro">Pro plan: up to {{ PRO_PAGE_LIMIT }} pages per import.</template>
        <template v-else>Free plan: up to {{ FREE_PAGE_LIMIT }} pages per import — Pro raises this to {{ PRO_PAGE_LIMIT }}.</template>
      </p>

      <div>
        <AppButton
          variant="outline"
          size="md"
          :label="selectedFiles.length ? 'Choose different files' : 'Choose a PDF or photos'"
          :icon="IconUpload"
          @click="openFilePicker"
        />
        <input
          ref="fileInputRef"
          type="file"
          multiple
          :accept="ACCEPTED_MIME_TYPES.join(',')"
          class="hidden"
          @change="onFilesPicked"
        />
      </div>

      <!-- Selected files -->
      <div v-if="selectedFiles.length" class="rounded-md border border-border divide-y divide-border">
        <div
          v-for="(file, index) in selectedFiles"
          :key="`${file.name}-${index}`"
          class="flex items-center gap-2 px-3 py-2"
        >
          <component
            :is="file.type === 'application/pdf' ? IconDocument : IconImages"
            class="h-4 w-4 text-muted-foreground shrink-0"
          />
          <span class="text-body text-foreground truncate flex-1">{{ file.name }}</span>
          <span class="text-caption text-muted-foreground shrink-0">{{ formatBytes(file.size) }}</span>
          <AppButton variant="ghost" size="icon-xs" :icon="IconClose" aria-label="Remove file" @click="removeFile(index)" />
        </div>
      </div>

      <!-- Count / cost / caps -->
      <template v-if="counting">
        <p class="text-caption text-muted-foreground italic">Reading document…</p>
      </template>
      <template v-else-if="countResult && !countResult.ok">
        <p class="text-caption text-destructive">{{ countResult.message }}</p>
      </template>
      <ProFeatureGate v-else-if="pageCapUpsell" :message="pageCapUpsell.message" />
      <p v-else-if="validationFailure" class="text-caption text-destructive">{{ validationFailure.message }}</p>
      <div v-else-if="countResult?.ok" class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
        <p class="text-body text-foreground">{{ pageLabel(countResult.pageCount) }}</p>
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

      <!-- Display name -->
      <div>
        <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Name *</label>
        <AppInput v-model="displayName" tone="muted" size="body" placeholder="e.g. Chapter 3 notes" />
      </div>

      <!-- Rights attestation -->
      <AppCheckbox v-model="rightsAttested" size="md" label="I have the right to use this material." />

      <p v-if="uploadError" class="text-caption text-destructive">{{ uploadError }}</p>

      <div class="flex justify-end pt-2">
        <AppButton
          variant="primary"
          size="md"
          label="Upload"
          :icon="IconUpload"
          :loading="createImport.isPending.value"
          :disabled="!canSubmitUpload"
          @click="submitUpload"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
/**
 * Document importer (#353, chunk 3) — the whole pre-review surface.
 *
 * A DM picks a PDF or a batch of page photos, sees the page count, the credit
 * cost and their plan's page cap before committing to anything, ticks a rights
 * attestation, uploads, starts extraction, and watches it run. Once the row
 * lands on `review`, this hands off entirely to `DocumentImportWizard` (a
 * sibling component, owned and built elsewhere) and gets out of the way.
 *
 * ── How the two terminal states are observed ────────────────────────────────
 *
 * `failed` is read off the row. `useActiveDocumentImport()` includes it in
 * `ACTIVE_STATUSES` (widened by migration 20260824224729) specifically so this
 * component can explain a failure that outlives the session: an extraction that
 * fails has already spent the credits and the extractor has already deleted the
 * uploaded document, so a DM returning to this tab must find out what happened
 * rather than a blank upload form. `document_imports.error` carries the reason.
 *
 * `complete` is NOT in that list, on purpose — a finished import has nothing to
 * resume and nothing to explain, and including it would let a success block the
 * next import until it was dismissed by hand. So the row does stop being
 * returned once it completes.
 *
 * `localOutcome` therefore covers two narrower cases: the completion the wizard
 * reports via `@finished` (where the row is deliberately gone), and an error
 * thrown by `useStartExtraction()`'s own mutation before any row status
 * changed. The `failedView` / `completeView` computeds check the live row
 * first and fall back to it.
 */
import { computed, ref, watch } from "vue";
import {
  IconClose,
  IconDelete,
  IconDocument,
  IconGenerate,
  IconImages,
  IconRefresh,
  IconUpload,
} from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import LoadingSpinner from "@/components/common/LoadingSpinner.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import DocumentImportWizard from "@/components/campaign/DocumentImportWizard.vue";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useSubscription } from "@/composables/useSubscription";
import { useAiCredits } from "@/composables/useAiCredits";
import {
  useActiveDocumentImport,
  useCreateDocumentImport,
  useStartExtraction,
  useImportCost,
  useAbandonDocumentImport,
} from "@/composables/useDocumentImport";
import { countPages, type PageCountResult } from "@/lib/documentImport/pageCount";
import {
  validateUpload,
  ACCEPTED_MIME_TYPES,
  FREE_PAGE_LIMIT,
  PRO_PAGE_LIMIT,
  type UploadValidationResult,
} from "@/lib/documentImport/limits";
import { IMPORT_ENTITY_KINDS, type DocumentImport, type ImportEntityKind } from "@/types/documentImport.types";

const KIND_LABELS: Record<ImportEntityKind, string> = {
  monsters: "Monsters",
  npcs: "NPCs",
  locations: "Locations",
  items: "Items",
  spells: "Spells",
  quests: "Quests",
  factions: "Factions",
};

function pageLabel(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

function formatBytes(bytes: number): string {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

const { confirm } = useConfirm();
const toast = useToast();
const { isPro } = useSubscription();
const { affordable } = useAiCredits();

// ── The active row, and the terminal-state fallback ──────────────────────────

const activeImportQuery = useActiveDocumentImport();
const activeImport = computed(() => activeImportQuery.data.value ?? null);
const isLoadingActive = activeImportQuery.isPending;

const pendingRow = computed(() => (activeImport.value?.status === "pending" ? activeImport.value : null));
const extractingRow = computed(() => (activeImport.value?.status === "extracting" ? activeImport.value : null));
const reviewRow = computed(() => (activeImport.value?.status === "review" ? activeImport.value : null));

type LocalOutcome =
  | { kind: "failed"; id: string; sourcePaths: string[]; displayName: string; error: string }
  | { kind: "complete"; displayName: string; importedCounts?: Partial<Record<ImportEntityKind, number>> };

const localOutcome = ref<LocalOutcome | null>(null);
/** Set while a `Start extraction` attempt is in flight or has just failed but
 *  left the row resumable (`pending`) — see `onStartExtraction`. */
const pendingStartError = ref<string | null>(null);

const failedView = computed(() => {
  const row = activeImport.value;
  if (row?.status === "failed") {
    return {
      kind: "failed" as const,
      id: row.id,
      sourcePaths: row.source_paths,
      displayName: row.display_name,
      error: row.error ?? "The extraction failed.",
    };
  }
  return localOutcome.value?.kind === "failed" ? localOutcome.value : null;
});

const completeView = computed(() => {
  const row = activeImport.value;
  if (row?.status === "complete") {
    return { kind: "complete" as const, displayName: row.display_name, importedCounts: row.imported_counts };
  }
  return localOutcome.value?.kind === "complete" ? localOutcome.value : null;
});

function hasImportedCounts(view: { importedCounts?: Partial<Record<ImportEntityKind, number>> }): boolean {
  return IMPORT_ENTITY_KINDS.some((kind) => (view.importedCounts?.[kind] ?? 0) > 0);
}

// A row landing on `pending` (still resumable) or any other non-terminal
// status is the freshest truth there is — drop any stale local fallback.
// A row disappearing right after we last saw it `extracting`, or right after
// a `Start extraction` attempt we made ourselves failed, is read as a
// terminal failure — the only two ways a row can vanish from this query once
// it existed (the third, an abandon *we* triggered, never sets
// `pendingStartError` and is handled by its own callers clearing state).
watch(activeImport, (next, prev) => {
  if (next) {
    localOutcome.value = null;
    if (next.status !== "pending") pendingStartError.value = null;
    return;
  }
  if (prev && (prev.status === "extracting" || pendingStartError.value)) {
    localOutcome.value = {
      kind: "failed",
      id: prev.id,
      sourcePaths: prev.source_paths,
      displayName: prev.display_name,
      error: pendingStartError.value ?? "The extraction did not complete.",
    };
  }
  pendingStartError.value = null;
});

// ── Cost preview — shared by the upload step's estimate and the pending row's
// confirmed cost, so both read off the exact same query. ─────────────────────

const currentPageCount = computed<number>(() => {
  if (pendingRow.value) return pendingRow.value.page_count;
  return countResult.value?.ok ? countResult.value.pageCount : 0;
});
const { estimate: costEstimate, isLoading: costLoading, isError: costErrored } = useImportCost(currentPageCount);

// ── Upload step: file selection ───────────────────────────────────────────────

const fileInputRef = ref<HTMLInputElement | null>(null);
const selectedFiles = ref<File[]>([]);
const countResult = ref<PageCountResult | null>(null);
const counting = ref(false);
const displayName = ref("");
const rightsAttested = ref(false);
const uploadError = ref<string | null>(null);

function openFilePicker() {
  fileInputRef.value?.click();
}

function suggestDisplayName(files: File[]): string {
  if (files.length === 1 && files[0].type === "application/pdf") {
    return files[0].name.replace(/\.pdf$/i, "");
  }
  return `${files.length} page photo${files.length === 1 ? "" : "s"}`;
}

function onFilesPicked(event: Event) {
  const input = event.target as HTMLInputElement;
  const files = Array.from(input.files ?? []);
  input.value = ""; // allow re-picking the same selection
  if (!files.length) return;
  selectedFiles.value = files;
  if (!displayName.value.trim()) displayName.value = suggestDisplayName(files);
}

function removeFile(index: number) {
  selectedFiles.value = selectedFiles.value.filter((_, i) => i !== index);
}

watch(selectedFiles, async (files) => {
  countResult.value = null;
  uploadError.value = null;
  if (!files.length) return;
  counting.value = true;
  try {
    countResult.value = await countPages(files);
  } finally {
    counting.value = false;
  }
});

const perFileValidation = computed<UploadValidationResult | null>(() => {
  if (!countResult.value?.ok) return null;
  const pageCount = countResult.value.pageCount;
  for (const file of selectedFiles.value) {
    const result = validateUpload({ pageCount, byteSize: file.size, mimeType: file.type, isPro: isPro.value });
    if (!result.ok) return result;
  }
  return { ok: true };
});

const validationFailure = computed(() =>
  perFileValidation.value && !perFileValidation.value.ok ? perFileValidation.value : null,
);

const pageCapUpsell = computed(() =>
  validationFailure.value?.reason === "too_many_pages" && !isPro.value ? validationFailure.value : null,
);

const canSubmitUpload = computed(
  () =>
    countResult.value?.ok === true &&
    perFileValidation.value?.ok === true &&
    rightsAttested.value &&
    displayName.value.trim().length > 0 &&
    !createImport.isPending.value,
);

// ── Mutations ──────────────────────────────────────────────────────────────

const createImport = useCreateDocumentImport();
const startExtraction = useStartExtraction();
const abandonImport = useAbandonDocumentImport();

function resetUploadForm() {
  selectedFiles.value = [];
  countResult.value = null;
  displayName.value = "";
  rightsAttested.value = false;
  uploadError.value = null;
}

async function submitUpload() {
  if (!countResult.value?.ok) return;
  uploadError.value = null;
  try {
    await createImport.mutateAsync({
      files: selectedFiles.value,
      sourceKind: countResult.value.kind,
      displayName: displayName.value.trim(),
      pageCount: countResult.value.pageCount,
      rightsAttested: rightsAttested.value,
    });
    resetUploadForm();
  } catch (err) {
    uploadError.value = toast.fromError(err, "Could not start the import.");
  }
}

async function onStartExtraction(row: DocumentImport) {
  pendingStartError.value = null;
  try {
    const outcome = await startExtraction.mutateAsync(row.id);
    if (outcome.warning) toast.info(outcome.warning, 8000);
  } catch (err) {
    // Left for the `activeImport` watcher above to interpret: if the row is
    // still `pending` after this settles, it stays visible as an inline retry
    // here; if the row is gone, the watcher promotes this into `localOutcome`.
    pendingStartError.value = toast.fromError(err, "Extraction failed.");
  }
}

async function abandonPending(row: DocumentImport) {
  const ok = await confirm("Abandon this import? The uploaded document will be deleted.", {
    title: "Abandon import",
    confirmLabel: "Abandon",
    danger: true,
  });
  if (!ok) return;
  abandonError.value = null;
  try {
    await abandonImport.mutateAsync({ id: row.id, source_paths: row.source_paths });
  } catch (err) {
    abandonError.value = toast.fromError(err, "Could not abandon the import.");
  }
}

const abandonError = ref<string | null>(null);

async function discardFailedImport(view: { id: string; sourcePaths: string[] }) {
  const ok = await confirm("Discard this failed import? You'll need to upload the document again.", {
    title: "Discard import",
    confirmLabel: "Discard",
    danger: true,
  });
  if (!ok) return;
  abandonError.value = null;
  try {
    await abandonImport.mutateAsync({ id: view.id, source_paths: view.sourcePaths });
    localOutcome.value = null;
  } catch (err) {
    abandonError.value = toast.fromError(err, "Could not discard the import.");
  }
}

function onWizardFinished() {
  const row = reviewRow.value;
  localOutcome.value = {
    kind: "complete",
    displayName: row?.display_name ?? "Import",
    importedCounts: row?.imported_counts,
  };
}

function startNewImport() {
  localOutcome.value = null;
  resetUploadForm();
}
</script>
