<template>
  <div class="space-y-4">
    <div>
      <label class="block text-eyebrow font-semibold text-muted-foreground mb-1">Paste the page text</label>
      <!--
        Native RichTextEditor, not a plain <textarea> — and this is the
        opposite case from CLAUDE.md's "native <textarea> for AI-prompt
        fields" exception, not a violation of it. That exception exists
        because a prompt box's markup would be noise the model never asked
        for. Here the box holds the SOURCE DOCUMENT, not a prompt: the whole
        feature depends on a real ⌘C off a published page carrying HTML
        structure (headings, boxed text, tables) that a flat textarea would
        throw away on paste — see sourceHtml.ts's file header. A rich editor
        is also what lets the DM see and trim what landed before spending
        credits, which a plain textarea showing raw markdown would not.
      -->
      <div @paste.capture="onEditorPasteCapture">
        <RichTextEditor
          :key="editorKey"
          v-model="content"
          size="lg"
          placeholder="Copy the whole page from your source and paste it here…"
        />
      </div>
    </div>

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
 * ── Why the paste handler intercepts in the capture phase ─────────────────
 *
 * `RichTextEditor.vue` is frozen for this story (see its own file — it
 * exposes no "insert HTML" command, and its `modelValue` prop is read only
 * once, at mount, not watched — so there is no way to hand it new content
 * after the fact except through a real edit or its own internal paste
 * handling). Its internal `handlePaste`/ProseMirror listener is attached
 * directly to the contenteditable DOM node, which is the paste event's
 * actual target — so a normal (bubble-phase) listener on a wrapper around it
 * would only ever run *after* that internal handling already happened.
 * Registering in the **capture** phase (`@paste.capture`) runs this handler
 * first, and calling `stopPropagation()` (not just `preventDefault()`) stops
 * the event from ever reaching RichTextEditor's own listener at all — so
 * normalization fully replaces its handling for an HTML paste rather than
 * running alongside it and doubling the inserted content.
 *
 * Once normalized HTML is converted to Tiptap content (`sourceHtmlToTiptapContent`),
 * it is appended to the current document and the editor is remounted via a
 * bumped `:key` — the only way to hand it fresh initial content, for the
 * same "modelValue is mount-only" reason above. A plain-text-only paste (no
 * `text/html` flavour on the clipboard) is left alone here and falls through
 * to RichTextEditor's own existing markdown/plain-text paste handling, which
 * is already reasonable for that case.
 */
import { computed, ref } from "vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
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
import { sourceHtmlToTiptapContent } from "@/lib/tiptap/sourceHtml";
import { tiptapToMarkdown } from "@/lib/tiptap/tiptapToMarkdown";

function pageLabel(count: number): string {
  return `${count} ${count === 1 ? "page" : "pages"}`;
}

const toast = useToast();
const { isPro } = useSubscription();
const createImport = useCreateDocumentImport();

// ── Paste editor state ───────────────────────────────────────────────────

const content = ref<string>("");
/** Bumped to force RichTextEditor to remount with `content` as fresh initial
 *  content — see the file header on why a plain v-model set doesn't do it. */
const editorKey = ref(0);

function onEditorPasteCapture(event: ClipboardEvent) {
  const dt = event.clipboardData;
  if (!dt) return;
  const html = dt.getData("text/html");
  if (!html) return; // plain-text-only paste — let RichTextEditor handle it natively
  event.preventDefault();
  event.stopPropagation();

  const newBlocks = sourceHtmlToTiptapContent(html);
  let existingBlocks: unknown[] = [];
  if (content.value) {
    try {
      const parsed: unknown = JSON.parse(content.value);
      if (parsed && typeof parsed === "object" && Array.isArray((parsed as { content?: unknown }).content)) {
        existingBlocks = (parsed as { content: unknown[] }).content;
      }
    } catch {
      // Malformed existing content shouldn't block a paste — start fresh.
    }
  }
  content.value = JSON.stringify({ type: "doc", content: [...existingBlocks, ...newBlocks] });
  editorKey.value++;
}

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
  content.value = "";
  editorKey.value++;
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
