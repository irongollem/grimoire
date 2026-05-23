<template>
  <PdfPreviewDialog
    :show="showPdfPreview"
    :blob-url="pdfBlobUrl"
    :title="title"
    :broken-images="pdfBrokenImages"
    @close="closePdfPreview"
    @save="savePdf"
  />
  <AssetInsertPanel
    :show="showAssetPanel"
    :editor="editor"
    :theme="theme"
    @close="showAssetPanel = false"
  />
  <BlockPickerPanel
    :show="showBlockPicker"
    :editor="editor"
    :is-two-column="isTwoColumn"
    @close="showBlockPicker = false"
    @open-asset-panel="
      showBlockPicker = false;
      showAssetPanel = true;
    "
    @open-art-picker="
      showBlockPicker = false;
      showArtPicker = true;
    "
  />
  <ArtPickerModal
    :show="showArtPicker"
    @select="editor?.chain().focus().setImage({ src: $event }).run()"
    @close="showArtPicker = false"
  />
  <CoverPageInspector
    :show="showCoverInspector"
    :editor="editor ?? null"
    @close="showCoverInspector = false"
  />

  <div class="flex flex-col gap-3 lg:h-full">
    <!-- Metadata row -->
    <ScriptoriumMetadataToolbar
      :title="title"
      :doc-type="docType"
      :is-published="isPublished"
      :show-page-numbers="showPageNumbers"
      :footer-text="footerText"
      :page-number-start="pageNumberStart"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :is-new="!props.doc"
      @update:title="title = $event"
      @update:doc-type="docType = $event as ScriptoriumDocType"
      @update:is-published="isPublished = $event"
      @update:show-page-numbers="showPageNumbers = $event"
      @update:footer-text="footerText = $event"
      @update:page-number-start="pageNumberStart = $event"
      @save="save"
      @delete="destroy"
    />

    <!-- Tags row -->
    <TagInput v-model="tags" />

    <p v-if="saveError" class="text-destructive font-fell text-sm">
      {{ saveError }}
    </p>

    <!-- Editor / Preview split -->
    <div class="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1 lg:min-h-0">
      <!-- Editor pane -->
      <div class="flex flex-col rounded-lg border border-border bg-card lg:overflow-hidden">
        <ScriptoriumEditorToolbar
          :editor="editor"
          :is-two-column="isTwoColumn"
          :theme="theme"
          :page-size="pageSize"
          :ink-friendly="inkFriendly"
          :show-block-picker="showBlockPicker"
          :show-cover-inspector="showCoverInspector"
          :selected-image-is-supabase="selectedImageIsSupabase"
          :has-doc="!!props.doc"
          @update:is-two-column="isTwoColumn = $event"
          @update:theme="theme = $event"
          @update:page-size="pageSize = $event"
          @update:ink-friendly="inkFriendly = $event"
          @open-asset-panel="showAssetPanel = true"
          @open-block-picker="showBlockPicker = true"
          @open-cover-inspector="showCoverInspector = true"
          @edit-in-illuminator="editInIlluminator"
          @set-image-pos="setImagePos"
        />

        <!-- Tiptap content -->
        <div class="p-4 lg:flex-1 lg:overflow-auto lg:min-h-0 relative">
          <EditorContent :editor="editor" class="phb-editor h-full" />

          <!-- AI Enhance bubble menu -->
          <BubbleMenu
            v-if="editor && showEnhanceButton"
            :editor="editor"
            :tippy-options="{ duration: 100 }"
          >
            <div class="flex items-center rounded-md border border-border bg-card shadow-lg overflow-hidden">
              <button
                type="button"
                :disabled="isEnhancing"
                class="flex items-center gap-1.5 px-2.5 py-1.5 font-cinzel text-[11px] font-semibold tracking-wide text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                @click="onEnhance"
              >
                <IconLoadingAlt v-if="isEnhancing" class="h-3 w-3 animate-spin" />
                <IconWand v-else class="h-3 w-3" />
                Enhance
              </button>
            </div>
          </BubbleMenu>

          <!-- Inline error feedback -->
          <Transition name="enhance-error">
            <div
              v-if="enhanceError"
              class="absolute bottom-2 left-2 right-2 z-30 rounded-md bg-destructive/90 px-3 py-2 font-fell text-xs text-white shadow-lg"
            >
              {{ enhanceError }}
            </div>
          </Transition>
        </div>

        <!-- Word count footer -->
        <div class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <span class="font-fell text-[11px] text-muted-foreground italic">{{ wordCount }} words</span>
        </div>
      </div>

      <!-- Preview pane -->
      <ScriptoriumPreviewPane
        :pages="pages"
        :page-footers="pageFooters"
        :footer-text="footerText"
        :doc-type="docType"
        :theme="theme"
        :page-size="pageSize"
        :ink-friendly="inkFriendly"
        :is-two-column="isTwoColumn"
        :is-generating-pdf="isGeneratingPdf"
        @export-pdf="exportPdf"
      />
    </div>
  </div>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, onUnmounted } from "vue";
import { useRouter } from "vue-router";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { useScriptoriumIlluminator } from "@/composables/useScriptoriumIlluminator";
import { IconLoadingAlt, IconWand } from "@/lib/icons";
import {
  useCreateScriptoriumDocument,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
} from "@/composables/useScriptorium";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import { useScriptoriumPdf } from "@/composables/useScriptoriumPdf";
import { buildTocPages } from "@/lib/tiptap/tocBlock";
import type {
  ScriptoriumDocument,
  ScriptoriumDocType,
  ScriptoriumTheme,
  ScriptoriumPageSize,
} from "@/types/scriptorium.types";
import PdfPreviewDialog from "@/components/scriptorium/PdfPreviewDialog.vue";
import AssetInsertPanel from "@/components/scriptorium/AssetInsertPanel.vue";
import BlockPickerPanel from "@/components/scriptorium/BlockPickerPanel.vue";
import CoverPageInspector from "@/components/scriptorium/CoverPageInspector.vue";
import ArtPickerModal from "@/components/common/ArtPickerModal.vue";
import TagInput from "@/components/common/TagInput.vue";
import PaywallModal from "@/components/common/PaywallModal.vue";
import ScriptoriumMetadataToolbar from "@/components/scriptorium/ScriptoriumMetadataToolbar.vue";
import ScriptoriumEditorToolbar from "@/components/scriptorium/ScriptoriumEditorToolbar.vue";
import ScriptoriumPreviewPane from "@/components/scriptorium/ScriptoriumPreviewPane.vue";
import { isQuotaExceeded } from "@/lib/quotaError";
import { useTextEnhancement } from "@/ai/useTextEnhancement";
import { parseMarkdown } from "@/lib/markdownToTiptap";

const props = defineProps<{ doc: ScriptoriumDocument | null }>();
const router = useRouter();

// Panels
const showAssetPanel = ref(false);
const showBlockPicker = ref(false);
const showCoverInspector = ref(false);
const showArtPicker = ref(false);

// Metadata
const title = ref(props.doc?.title ?? "");
const docType = ref<ScriptoriumDocType>(props.doc?.doc_type ?? "custom");
const isPublished = ref(props.doc?.is_published ?? false);
const isTwoColumn = ref(props.doc?.is_two_column ?? false);
const theme = ref<ScriptoriumTheme>(props.doc?.theme ?? "onednd2024");
const pageSize = ref<ScriptoriumPageSize>(props.doc?.page_size ?? "A4");
const inkFriendly = ref(props.doc?.ink_friendly ?? false);
const tags = ref<string[]>(props.doc?.tags ?? []);
const showPageNumbers = ref(props.doc?.show_page_numbers ?? false);
const footerText = ref(props.doc?.footer_text ?? "");
const pageNumberStart = ref(props.doc?.page_number_start ?? 1);

// Editor
const previewHtml = ref("");
const wordCount = ref(0);

function updateDerived(html: string, text: string) {
  previewHtml.value = html;
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0;
}

const editor = useEditor({
  content: (() => {
    if (!props.doc?.content) return "";
    try {
      return JSON.parse(props.doc.content);
    } catch {
      return props.doc.content;
    }
  })(),
  extensions: createScriptoriumExtensions(),
  onCreate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
  onUpdate({ editor }) {
    updateDerived(editor.getHTML(), editor.getText());
  },
});

function setImagePos(
  side: "posTop" | "posLeft" | "posRight" | "posBottom",
  value: string,
) {
  editor.value
    ?.chain()
    .focus()
    .updateAttributes("image", { [side]: value || null })
    .run();
}

const { mutateAsync: create } = useCreateScriptoriumDocument();
const { mutateAsync: update } = useUpdateScriptoriumDocument();
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();
const isSaving = ref(false);
const showPaywall = ref(false);
const isDeleting = ref(false);
const saveError = ref("");

const { selectedImageIsSupabase, editInIlluminator } = useScriptoriumIlluminator(
  editor,
  computed(() => props.doc?.id),
);

async function destroy() {
  if (!props.doc) return;
  if (!(await confirm(`Delete "${props.doc.title}"? This cannot be undone.`)))
    return;
  isDeleting.value = true;
  const oldContent = props.doc.content;
  try {
    await deleteDoc(props.doc.id);
    removeRichTextImages(oldContent);
    router.replace("/scriptorium");
  } catch (e: unknown) {
    saveError.value = e instanceof Error ? e.message : "Failed to delete";
    isDeleting.value = false;
  }
}

async function save() {
  if (!title.value.trim()) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    const payload = {
      title: title.value.trim(),
      content: JSON.stringify(editor.value?.getJSON() ?? {}),
      doc_type: docType.value,
      tags: tags.value,
      is_published: isPublished.value,
      is_two_column: isTwoColumn.value,
      theme: theme.value,
      page_size: pageSize.value,
      ink_friendly: inkFriendly.value,
      word_count: wordCount.value,
      show_page_numbers: showPageNumbers.value,
      footer_text: footerText.value,
      page_number_start: pageNumberStart.value,
    };
    if (props.doc) {
      const oldContent = props.doc.content;
      await update({ id: props.doc.id, update: payload });
      cleanupRemovedRichTextImages(oldContent, payload.content);
    } else {
      const created = await create(payload);
      router.replace(`/scriptorium/${created.id}`);
    }
  } catch (e: unknown) {
    if (isQuotaExceeded(e)) {
      showPaywall.value = true;
      return;
    }
    saveError.value = e instanceof Error ? e.message : "Failed to save";
  } finally {
    isSaving.value = false;
  }
}

const pages = computed(() => {
  const html = previewHtml.value || "";
  const parts = html.split(/<hr\s*\/?\s*>/gi);
  while (parts.length > 1 && !parts[0].trim()) parts.shift();
  while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
  const rawPages = parts.length ? parts : [""];
  return buildTocPages(rawPages);
});

const pageFooters = computed<(string | null)[]>(() => {
  if (!showPageNumbers.value) return pages.value.map(() => null);

  const skipTag = 'data-type="skip-counting"';
  const resetTag = 'data-type="reset-counting"';
  let counter = pageNumberStart.value;
  return pages.value.map((html, _idx) => {
    if (
      html.includes('data-type="coverPage"') &&
      (html.includes('data-variant="front"') ||
        html.includes('data-variant="back"'))
    ) {
      return null;
    }
    const hasSkip = html.includes(skipTag);
    const hasReset = html.includes(resetTag);
    if (hasReset) counter = pageNumberStart.value;
    if (hasSkip) return null;
    const label = String(counter);
    counter++;
    return label;
  });
});

const {
  showPdfPreview,
  pdfBlobUrl,
  isGeneratingPdf,
  pdfBrokenImages,
  exportPdf,
  savePdf,
  closePdfPreview,
} = useScriptoriumPdf(
  pages,
  title,
  theme,
  pageSize,
  inkFriendly,
  pageFooters,
  footerText,
);

// ── AI text enhancement ───────────────────────────────────────────────────────

const SCRIPTORIUM_STYLE: Partial<Record<ScriptoriumDocType, string>> = {
  spell:
    "2024 Player's Handbook spell description: present tense, mechanical precision, second-person address ('you'). No preamble.",
  monster:
    "2024 Monster Manual lore: third-person, atmospheric, present tense. One to two paragraphs.",
  item: "2024 Dungeon Master's Guide item entry: one evocative flavour sentence followed by concise property text.",
  adventure:
    "D&D read-aloud boxed text or DM narrative: infer register from surrounding content. Present tense.",
  background:
    "2024 Player's Handbook background feature: one paragraph, present tense, describes what the character can do.",
  location:
    "D&D sourcebook location description: open with the most striking sensory detail, present tense, two paragraphs.",
  class:
    "2024 Player's Handbook class feature: 'At Nth level, you gain…' voice, present tense, precise.",
  subclass:
    "2024 Player's Handbook subclass feature description, same voice as class features.",
  race: "2024 Player's Handbook species description: third-person, present tense, one to two paragraphs.",
};

const CONTEXT_RADIUS = 300;

const { isEnhancing, hasTextProvider, enhance } = useTextEnhancement();
const enhanceError = ref<string | null>(null);

const showEnhanceButton = computed(() => hasTextProvider());

async function onEnhance() {
  if (!editor.value || isEnhancing.value) return;
  const { from, to } = editor.value.state.selection;
  if (from === to) return;

  const selectedText = editor.value.state.doc.textBetween(from, to, " ");
  if (!selectedText.trim()) return;

  const docSize = editor.value.state.doc.content.size;
  const before = editor.value.state.doc.textBetween(
    Math.max(0, from - CONTEXT_RADIUS),
    from,
    " ",
  );
  const after = editor.value.state.doc.textBetween(
    to,
    Math.min(docSize, to + CONTEXT_RADIUS),
    " ",
  );
  const surroundingContext = [before, "[[SELECTION]]", after]
    .filter(Boolean)
    .join(" ");

  enhanceError.value = null;
  try {
    const markdown = await enhance(selectedText, "Scriptorium document", {
      styleHint: SCRIPTORIUM_STYLE[docType.value],
      surroundingContext: surroundingContext.trim() || undefined,
    });
    const nodes = parseMarkdown(markdown);
    editor.value
      .chain()
      .focus()
      .deleteRange({ from, to })
      .insertContentAt(from, nodes, {
        parseOptions: { preserveWhitespace: false },
      })
      .run();
  } catch (e) {
    enhanceError.value = e instanceof Error ? e.message : "Enhancement failed";
    setTimeout(() => {
      enhanceError.value = null;
    }, 4000);
  }
}

onUnmounted(() => {
  editor.value?.destroy();
});
</script>

<style scoped>
@reference "@/assets/main.css";

.enhance-error-enter-active,
.enhance-error-leave-active {
  transition: opacity 0.2s ease;
}
.enhance-error-enter-from,
.enhance-error-leave-to {
  opacity: 0;
}

input:not([type="checkbox"]):not([type="radio"]),
select {
  background-color: var(--card);
  color: var(--foreground);
}

/* ── Editor (dark app theme) ──────────────────────────────────── */
.phb-editor :deep(.ProseMirror) {
  @apply font-fell text-foreground outline-none;
  min-height: 100%;
  line-height: 1.75;
  font-size: 0.9375rem;
}
.phb-editor :deep(.ProseMirror p.is-editor-empty:first-child::before) {
  content: attr(data-placeholder);
  @apply text-muted-foreground;
  float: left;
  pointer-events: none;
  height: 0;
}
.phb-editor :deep(.ProseMirror h1) {
  @apply font-cinzel text-2xl font-bold mt-4 mb-2;
}
.phb-editor :deep(.ProseMirror h2) {
  @apply font-cinzel text-xl font-bold mt-3 mb-1.5;
}
.phb-editor :deep(.ProseMirror h3) {
  @apply font-cinzel text-base font-semibold mt-2 mb-1;
}
.phb-editor :deep(.ProseMirror ul),
.phb-editor :deep(.ProseMirror ol) {
  @apply pl-6 my-2;
}
.phb-editor :deep(.ProseMirror p) {
  font-style: normal;
}
.phb-editor :deep(.ProseMirror .sc-descriptive p),
.phb-editor :deep(.ProseMirror blockquote p),
.phb-editor :deep(.ProseMirror .sc-quote p) {
  font-style: italic;
}
.phb-editor :deep(.ProseMirror blockquote) {
  @apply border-l-4 border-primary pl-3 text-muted-foreground italic my-2;
}
.phb-editor :deep(.ProseMirror hr) {
  @apply border-border my-4;
}
.phb-editor :deep(.ProseMirror code) {
  @apply bg-muted px-1 rounded text-sm font-mono;
}
.phb-editor :deep(.ProseMirror pre) {
  @apply bg-muted p-3 rounded my-2 text-sm;
}
.phb-editor :deep(.ProseMirror img) {
  max-width: 100%;
  max-height: 640px;
  border-radius: 6px;
  object-fit: cover;
}

.phb-editor :deep(.ProseMirror .sc-spacer-v) {
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  position: relative;
  min-height: 4px;
}
.phb-editor :deep(.ProseMirror .sc-spacer-v::after) {
  content: "spacer";
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
  letter-spacing: 0.04em;
}
.phb-editor :deep(.ProseMirror .sc-spacer-h) {
  border-bottom: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  vertical-align: bottom;
  min-width: 4px;
  height: 1em;
}

.phb-editor :deep(.ProseMirror .sc-column-break) {
  display: block;
  height: 0;
  border-top: 1px dashed color-mix(in srgb, var(--sc-col-rule, currentColor) 60%, transparent);
  margin: 0.5rem 0;
  position: relative;
}
.phb-editor :deep(.ProseMirror .sc-column-break::after) {
  content: "column break";
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, sans-serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 40%, transparent);
  background: var(--background, #fff);
  padding: 0 0.4rem;
  pointer-events: none;
}

.phb-editor :deep(.ProseMirror img[data-type="watercolor"]) {
  outline: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
  outline-offset: 2px;
  border-radius: 2px;
  mix-blend-mode: multiply;
}

.phb-editor :deep(.ProseMirror div[data-type="watermark"]) {
  position: static !important;
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  padding: 0.25rem 0.75rem;
  margin: 0.5rem 0;
  overflow: hidden;
  max-height: 3rem;
}
.phb-editor :deep(.ProseMirror div[data-type="watermark"] span) {
  position: static !important;
  font-size: 1.25rem;
  transform: none !important;
  opacity: 0.45;
}

.phb-editor :deep(.ProseMirror div[data-type="artistCredit"]) {
  position: static !important;
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 2px;
  padding: 0.15rem 0.5rem;
  margin: 0.25rem 0;
  font-size: 0.7rem;
  font-style: italic;
  opacity: 0.65;
}

.phb-editor :deep(.ProseMirror .sc-wide) {
  outline: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  outline-offset: 3px;
  border-radius: 2px;
  padding: 0.25rem;
  margin: 0.5rem 0;
  position: relative;
}
.phb-editor :deep(.ProseMirror .sc-wide::before) {
  content: "wide";
  position: absolute;
  top: -0.75rem;
  left: 0.25rem;
  font-family: system-ui, sans-serif;
  font-size: 9px;
  letter-spacing: 0.06em;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
}

.phb-editor :deep(.ProseMirror div[data-type="coverPage"]) {
  position: relative;
  display: block;
  border: 2px dashed color-mix(in srgb, currentColor 30%, transparent);
  border-radius: 4px;
  min-height: 8rem;
  margin: 0.75rem 0;
  overflow: hidden;
  cursor: default;
}
.phb-editor :deep(.ProseMirror div[data-type="coverPage"]::before) {
  content: "cover: " attr(data-variant);
  position: absolute;
  top: 50%;
  left: 50%;
  transform: translate(-50%, -50%);
  font-family: system-ui, sans-serif;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: color-mix(in srgb, currentColor 45%, transparent);
  pointer-events: none;
  white-space: nowrap;
}
.phb-editor :deep(.ProseMirror div[data-type="coverPage"] > *) {
  display: none;
}

.phb-editor :deep(.ProseMirror .sc-skip-counting),
.phb-editor :deep(.ProseMirror .sc-reset-counting) {
  display: inline-flex;
  align-items: center;
  padding: 0.1rem 0.5rem;
  border: 1px dashed color-mix(in srgb, currentColor 40%, transparent);
  border-radius: 3px;
  font-family: system-ui, sans-serif;
  font-size: 10px;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, currentColor 55%, transparent);
  background: color-mix(in srgb, currentColor 5%, transparent);
  cursor: default;
  user-select: none;
  margin: 0.25rem 0;
}
.phb-editor :deep(.ProseMirror .sc-skip-counting::before) {
  content: "skip #";
}
.phb-editor :deep(.ProseMirror .sc-reset-counting::before) {
  content: "reset \2116";
}

.phb-editor :deep(.ProseMirror nav[data-type="toc"]) {
  display: block;
  border: 1px dashed color-mix(in srgb, currentColor 35%, transparent);
  border-radius: 4px;
  padding: 0.75rem 1rem;
  margin: 0.75rem 0;
  font-family: system-ui, sans-serif;
  font-size: 0.75rem;
  text-align: center;
  letter-spacing: 0.05em;
  color: color-mix(in srgb, currentColor 45%, transparent);
}
.phb-editor :deep(.ProseMirror nav[data-type="toc"]::after) {
  content: "Table of Contents (auto-generated on preview)";
}

.phb-editor :deep(.ProseMirror .sc-class-table) {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sc-body-font, Georgia, serif);
  font-size: 0.6875rem;
  color: var(--sc-ink, #1a1a1a);
  line-height: 1.3;
  margin: 0.75rem 0;
}
.phb-editor :deep(.ProseMirror .sc-class-table th) {
  font-family: var(--sc-heading-font, "Cinzel", Georgia, serif);
  font-size: 0.75rem;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  color: var(--sc-accent-contrast, #f9f6ef);
  background: var(--sc-accent, #1b3a4b);
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--sc-accent, #1b3a4b);
  white-space: normal;
  min-width: 0;
}
.phb-editor :deep(.ProseMirror .sc-class-table td) {
  text-align: center;
  padding: 0.2rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--sc-accent, #1b3a4b) 30%, transparent);
  vertical-align: middle;
}
.phb-editor :deep(.ProseMirror .sc-class-table td p),
.phb-editor :deep(.ProseMirror .sc-class-table th p) {
  margin: 0;
}
.phb-editor :deep(.ProseMirror .sc-class-table tr:nth-child(odd) td) {
  background: color-mix(in srgb, var(--sc-accent, #1b3a4b) 8%, transparent);
}
.phb-editor :deep(.ProseMirror .sc-class-table td:first-child) {
  font-weight: 700;
}

.phb-editor :deep(.ProseMirror .sc-ability-table th) {
  background: color-mix(in srgb, var(--sc-accent) 8%, transparent);
}

.phb-editor :deep(.ProseMirror .sc-ability-table--2024 td.sc-abil-name),
.phb-editor :deep(.ProseMirror .sc-ability-table--2024 thead th:not(.sc-abil-gap)) {
  background: color-mix(in srgb, currentColor 30%, transparent);
  font-weight: 700;
  font-variant: small-caps;
}
.phb-editor :deep(.ProseMirror .sc-ability-table--2024 .sc-abil-gap) {
  width: 1rem;
  border: none;
  background: transparent;
}

.phb-editor :deep(.ProseMirror .sc-img-wrap--absolute) {
  outline: 2px dashed oklch(0.7 0.15 250 / 0.6);
  outline-offset: 2px;
}

.phb-editor :deep(.ProseMirror .ProseMirror-selectednode),
.phb-editor :deep(.ProseMirror img.ProseMirror-selectednode) {
  outline: 2px solid oklch(0.6 0.2 250);
  outline-offset: 2px;
}

.phb-editor :deep(.ProseMirror [data-type="spacer-v"].ProseMirror-selectednode),
.phb-editor :deep(.ProseMirror [data-type="spacer-h"].ProseMirror-selectednode) {
  outline: 2px solid oklch(0.6 0.2 250);
  outline-offset: 0px;
  background: oklch(0.6 0.2 250 / 0.2);
}

.phb-editor :deep(.ProseMirror .sc-note) {
  border-left: 3px solid color-mix(in srgb, var(--primary, currentColor) 60%, transparent);
  background: color-mix(in srgb, var(--primary, currentColor) 8%, transparent);
  border-radius: 0 4px 4px 0;
  padding: 0.5rem 0.75rem;
  margin: 0.5rem 0;
}
.phb-editor :deep(.ProseMirror .sc-note p) {
  font-style: italic;
}

.phb-editor :deep(.ProseMirror .sc-descriptive) {
  border: 2px solid color-mix(in srgb, var(--primary, currentColor) 50%, transparent);
  background: color-mix(in srgb, var(--primary, currentColor) 6%, transparent);
  border-radius: 4px;
  padding: 0.75rem;
  margin: 0.5rem 0;
  font-style: italic;
}

.phb-editor :deep(.ProseMirror .sc-quote) {
  border-left: 2px solid color-mix(in srgb, currentColor 30%, transparent);
  padding: 0.25rem 0.75rem;
  margin: 0.5rem 0;
  font-style: italic;
  color: color-mix(in srgb, currentColor 75%, transparent);
}
.phb-editor :deep(.ProseMirror .sc-attribution) {
  font-style: normal;
  font-variant: small-caps;
  font-size: 0.875em;
  opacity: 0.75;
}
.phb-editor :deep(.ProseMirror .sc-attribution::before) {
  content: "\2014\00A0";
}
</style>
