<template>
  <div class="space-y-5">
    <!-- ── Done: counts, problems, the optional AI pass ───────────────────── -->
    <ArchiveResultStep v-if="run" :run="run" :pages="read?.pages ?? []" :display-name="resultName" @done="reset" />

    <!-- ── Review: decisions per page, then Import ────────────────────────── -->
    <ArchiveReviewStep
      v-else-if="row && read"
      :import-row="row"
      :pages="read.pages"
      :kinds="kinds"
      @done="onSweepDone"
      @cancel="cancelImport"
    />

    <!-- ── Interrupted: the row survived a reload, the page bodies did not ── -->
    <template v-else-if="row">
      <div class="space-y-1">
        <h3 class="text-heading-sm font-semibold text-foreground">This wiki import was interrupted</h3>
        <p class="text-body text-muted-foreground">
          "{{ row.display_name }}" was being reviewed when the page was reloaded. The pages are only held in your browser while
          you review them, so drop the same export again to carry on. The kinds you settled are kept.
        </p>
      </div>
      <ArchiveFilePicker :reading="reading" :error="readError" @picked="onPicked" />
      <div class="flex justify-end">
        <AppButton variant="destructive" size="md" label="Abandon" :icon="IconDelete" :disabled="abandonImport.isPending.value" @click="cancelImport" />
      </div>
    </template>

    <!-- ── Sort: client-only, before any row exists ───────────────────────── -->
    <ArchiveSortStep
      v-else-if="read"
      v-model:kinds="kinds"
      v-model:display-name="displayName"
      v-model:rights-attested="rightsAttested"
      :result="read"
      :submitting="createImport.isPending.value"
      :error="createError"
      @continue="submitSort"
      @cancel="reset"
    />

    <!-- ── Pick ────────────────────────────────────────────────────────────── -->
    <ArchiveFilePicker v-else :reading="reading" :error="readError" @picked="onPicked" />
  </div>
</template>

<script setup lang="ts">
/**
 * The wiki-export source of the document importer (#932, story 6): LegendKeeper,
 * World Anvil or Obsidian pages brought over without AI. This host owns the
 * flow (pick, sort, review, result) and the in-memory pages; the steps are
 * their own components, and `DocumentImportTab` only decides when to show it.
 *
 * Page bodies live in `read` and nowhere else. The `document_imports` row,
 * created when the DM leaves the sort step, holds just the manifest, so a
 * reload leaves a row and no bodies: `importRow` without `read` is the
 * "interrupted" state, resolved by dropping the same export again (the settled
 * kinds are restored from the manifest by page `ref`) or by abandoning it.
 */
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ArchiveFilePicker from "@/components/campaign/ArchiveFilePicker.vue";
import ArchiveResultStep from "@/components/campaign/ArchiveResultStep.vue";
import ArchiveReviewStep from "@/components/campaign/ArchiveReviewStep.vue";
import ArchiveSortStep from "@/components/campaign/ArchiveSortStep.vue";
import { IconDelete } from "@/lib/icons";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useAbandonDocumentImport } from "@/composables/campaign/useDocumentImport";
import { useCreateArchiveImport, type ArchiveSweepRun } from "@/composables/campaign/useArchiveImport";
import { kindsFromManifest, parseArchiveManifest } from "@/lib/archiveImport/archiveManifest";
import { filesToArchiveInput, archiveDisplayName } from "@/lib/archiveImport/readFiles";
import { ArchiveReadError, readArchive } from "@/lib/archiveImport/readArchive";
import type { ArchivePageKind, ArchiveReadResult } from "@/lib/archiveImport/types";
import type { ArchiveDocumentImport } from "@/types/documentImport.types";

/** The active wiki import in review, when there is one (the tab reads it off `useActiveDocumentImport`). */
const { importRow = null } = defineProps<{ importRow?: ArchiveDocumentImport | null }>();

const { confirm } = useConfirm();
const toast = useToast();
const createImport = useCreateArchiveImport();
const abandonImport = useAbandonDocumentImport();

const read = ref<ArchiveReadResult | null>(null);
const kinds = ref(new Map<string, ArchivePageKind>());
const displayName = ref("");
const rightsAttested = ref(false);
const reading = ref(false);
const readError = ref<string | null>(null);
const createError = ref<string | null>(null);
const run = ref<ArchiveSweepRun | null>(null);
/** The row this session created, until the active-import query catches up with it (and after, once it completes). */
const createdRow = ref<ArchiveDocumentImport | null>(null);
const resultName = ref("");

const row = computed(() => importRow ?? createdRow.value);

function reset(): void {
  read.value = null;
  kinds.value = new Map();
  displayName.value = "";
  rightsAttested.value = false;
  readError.value = null;
  createError.value = null;
  run.value = null;
  createdRow.value = null;
}

async function onPicked(files: File[]): Promise<void> {
  reading.value = true;
  readError.value = null;
  try {
    const result = readArchive(await filesToArchiveInput(files));
    if (result.pages.length === 0) {
      readError.value = `No pages Grimoire can read were found in that export (${result.skipped.length} ${result.skipped.length === 1 ? "file" : "files"} skipped).`;
      return;
    }
    const restored = importRow ? restoreKinds(importRow, result) : null;
    if (importRow && !restored) {
      readError.value = "That does not look like the export this import was started from. Drop the same one again, or abandon this import.";
      return;
    }
    kinds.value = restored ?? new Map();
    displayName.value = archiveDisplayName(files);
    read.value = result;
  } catch (err) {
    readError.value = err instanceof ArchiveReadError ? err.message : toast.fromError(err, "Could not read that export.");
  } finally {
    reading.value = false;
  }
}

/** The kinds the DM settled before the interruption, for the pages this re-read shares with it; null when none are shared. */
function restoreKinds(interrupted: ArchiveDocumentImport, result: ArchiveReadResult): Map<string, ArchivePageKind> | null {
  const manifest = parseArchiveManifest(interrupted.extracted);
  if (!manifest) return null;
  const settled = kindsFromManifest(manifest);
  const restored = new Map<string, ArchivePageKind>();
  for (const page of result.pages) {
    const kind = settled.get(page.ref);
    if (kind) restored.set(page.ref, kind);
  }
  return restored.size > 0 ? restored : null;
}

async function submitSort(): Promise<void> {
  if (!read.value) return;
  createError.value = null;
  try {
    createdRow.value = await createImport.mutateAsync({
      displayName: displayName.value.trim(),
      source: read.value.source,
      pages: read.value.pages,
      kinds: kinds.value,
      rightsAttested: rightsAttested.value,
    });
  } catch (err) {
    createError.value = toast.fromError(err, "Could not start the import.");
  }
}

function onSweepDone(finished: ArchiveSweepRun): void {
  resultName.value = row.value?.display_name ?? displayName.value;
  run.value = finished;
}

async function cancelImport(): Promise<void> {
  const current = row.value;
  if (!current) return;
  const ok = await confirm("Cancel this import? Nothing has been created from it yet.", {
    title: "Cancel import",
    confirmLabel: "Cancel import",
    danger: true,
  });
  if (!ok) return;
  try {
    await abandonImport.mutateAsync({ id: current.id, source_paths: current.source_paths });
    reset();
  } catch (err) {
    toast.fromError(err, "Could not cancel the import.");
  }
}
</script>
