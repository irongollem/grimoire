<template>
  <div class="space-y-4">
    <DocumentPasteEditor ref="pasteEditorRef" v-model="content" />

    <template v-if="charCount === 0">
      <p class="text-caption text-muted-foreground italic">Paste some text to see its page count and cost.</p>
    </template>
    <ProFeatureGate v-else-if="pageCapUpsell" :message="pageCapUpsell.message" />
    <p v-else-if="validationFailure" class="text-caption text-destructive">{{ validationFailure.message }}</p>
    <div v-else class="rounded-md border border-border bg-muted/30 px-4 py-3 space-y-2">
      <p class="text-body text-foreground">{{ pageLabel(pageCount) }}</p>
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

    <div>
      <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Name *</label>
      <AppInput v-model="displayName" tone="muted" size="body" placeholder="e.g. Chapter 3 notes" />
    </div>

    <AppCheckbox v-model="rightsAttested" size="md" label="I have the right to use this material." />

    <p v-if="submitError" class="text-caption text-destructive">{{ submitError }}</p>

    <div class="flex justify-end pt-2">
      <AppButton
        variant="primary"
        size="md"
        label="Start import"
        :icon="IconGenerate"
        :loading="createImport.isPending.value"
        :disabled="!canSubmit"
        @click="submit"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The "paste text" source step of the document importer (#829) — a sibling
 * to the file-picker upload step in `DocumentImportTab.vue`, not a mode
 * inside it. It is fully self-contained: it runs its own
 * `useCreateDocumentImport` mutation, and on success that mutation's
 * `onSuccess` invalidates the same `document-imports` query
 * `DocumentImportTab.vue`'s `useActiveDocumentImport()` reads — so once a
 * paste-sourced row exists, the parent naturally swaps this step out for the
 * pending/extracting view on its own. This component never needs to emit
 * anything upward, the same reason `DocumentImportWizard` doesn't for its
 * own review step.
 *
 * Split out of `DocumentImportTab.vue` rather than added inline: that file
 * was already at its 600-line soft cap before this story, and the paste flow
 * (editor wiring, its own count/cost/validation block, its own name/rights
 * footer) is a full mini-form in its own right — not a small addition.
 *
 * The editor itself — the tricky, load-bearing paste-capture handling that
 * turns a real ⌘C off a source page into Tiptap content — lives in
 * `DocumentPasteEditor.vue` (#839), shared with the compact create-quest
 * paste review so a second caller reuses it rather than re-deriving it.
 */
import { computed, ref } from "vue";
import DocumentPasteEditor from "@/components/campaign/DocumentPasteEditor.vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import GenerationCostBadge from "@/components/common/GenerationCostBadge.vue";
import ProFeatureGate from "@/components/common/ProFeatureGate.vue";
import { IconGenerate } from "@/lib/icons";
import { useToast } from "@/composables/useToast";
import { useSubscription } from "@/composables/billing/useSubscription";
import { useCreateDocumentImport, useImportCost } from "@/composables/campaign/useDocumentImport";
import { pagesForText, validateTextImport, type UploadValidationResult } from "@/lib/documentImport/limits";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";

function pageLabel(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

const toast = useToast();
const { isPro } = useSubscription();
const createImport = useCreateDocumentImport();

// ── Paste editor state ───────────────────────────────────────────────────

const content = ref<string>("");
const pasteEditorRef = ref<InstanceType<typeof DocumentPasteEditor> | null>(null);

// ── Page count / cost / validation ───────────────────────────────────────

// Char count of the *markdown* this import will actually submit, not the
// rendered plain text — the DB's shape CHECK (migration 20260906213100)
// binds page_count to `char_length(source_text)`, and source_text is the
// markdown `tiptapToMarkdown` produces, not stripped plain text. Estimating
// off plain text would under-count and let a paste through here that the
// insert then fails on.
const charCount = computed(() => tiptapToMarkdown(content.value).length);
const pageCount = computed(() => pagesForText(charCount.value));

const validation = computed<UploadValidationResult | null>(() =>
  charCount.value > 0 ? validateTextImport(charCount.value, isPro.value) : null,
);
const validationFailure = computed(() => (validation.value && !validation.value.ok ? validation.value : null));
const pageCapUpsell = computed(() =>
  validationFailure.value?.reason === "too_many_pages" && !isPro.value ? validationFailure.value : null,
);

const { estimate: costEstimate, isLoading: costLoading, isError: costErrored } = useImportCost(pageCount);

// ── Name / rights / submit ───────────────────────────────────────────────

const displayName = ref("");
const rightsAttested = ref(false);
const submitError = ref<string | null>(null);

const canSubmit = computed(
  () =>
    charCount.value > 0 &&
    validation.value?.ok === true &&
    rightsAttested.value &&
    displayName.value.trim().length > 0 &&
    !createImport.isPending.value,
);

function resetForm() {
  pasteEditorRef.value?.reset();
  displayName.value = "";
  rightsAttested.value = false;
  submitError.value = null;
}

async function submit() {
  if (!canSubmit.value) return;
  submitError.value = null;
  try {
    await createImport.mutateAsync({
      files: [],
      sourceKind: "text",
      sourceText: tiptapToMarkdown(content.value),
      displayName: displayName.value.trim(),
      pageCount: pageCount.value,
      rightsAttested: rightsAttested.value,
    });
    resetForm();
  } catch (err) {
    submitError.value = toast.fromError(err, "Could not start the import.");
  }
}
</script>
