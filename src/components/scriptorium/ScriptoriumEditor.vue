<template>
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

        <!-- Tiptap content — the themed galley. The sc-theme + theme-* classes
             pull the shared book styling (src/assets/scriptorium/) onto the
             editing surface so the manuscript looks like the book. -->
        <div class="p-4 lg:flex-1 lg:overflow-auto lg:min-h-0 relative">
          <EditorContent
            :editor="editor"
            class="phb-editor sc-theme h-full"
            :class="[
              theme === 'phb2014' ? 'theme-phb2014' : 'theme-onednd2024',
              { 'ink-friendly': inkFriendly },
            ]"
          />

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
        :body-html="previewHtml"
        :footer-text="footerText"
        :show-page-numbers="showPageNumbers"
        :page-number-start="pageNumberStart"
        :doc-type="docType"
        :theme="theme"
        :page-size="pageSize"
        :ink-friendly="inkFriendly"
        :is-two-column="isTwoColumn"
        :is-generating-pdf="isPrinting"
        @export-pdf="exportPdf"
        @edit-block="focusBlock"
      />
    </div>
  </div>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, nextTick, onUnmounted } from "vue";
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
import { useScriptoriumPrint } from "@/composables/useScriptoriumPrint";
import { buildTocPages } from "@/lib/tiptap/tocBlock";
import { flagsFromHtml, computePageLabels } from "@/lib/scriptorium/pageNumbering";
import type {
  ScriptoriumDocument,
  ScriptoriumDocType,
  ScriptoriumTheme,
  ScriptoriumPageSize,
} from "@/types/scriptorium.types";
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

// Click-to-edit bridge: the preview emits the clicked block's id; locate that
// node in the doc, put the cursor there, and scroll the galley to it. Block
// ids come from the BlockId extension and survive Paged.js fragmentation.
function focusBlock(blockId: string) {
  const ed = editor.value;
  if (!ed) return;
  let targetPos: number | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (targetPos !== null) return false;
    if (node.attrs?.blockId === blockId) {
      targetPos = pos;
      return false;
    }
    return true;
  });
  if (targetPos === null) return;
  ed.chain().focus().setTextSelection(targetPos + 1).run();
  void nextTick(() => {
    document
      .querySelector(`.phb-editor [data-block-id="${CSS.escape(blockId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
}

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

// Body extracted to keep `computed` single-return — oxlint's
// `vue/return-in-computed-property` rule reports a false positive when while
// loops appear inside the getter body.
function htmlToPages(html: string): string[] {
  const parts = html.split(/<hr\s*\/?\s*>/gi);
  while (parts.length > 1 && !parts[0].trim()) parts.shift();
  while (parts.length > 1 && !parts[parts.length - 1].trim()) parts.pop();
  const rawPages = parts.length ? parts : [""];
  return buildTocPages(rawPages);
}
const pages = computed(() => htmlToPages(previewHtml.value || ""));

const pageFooters = computed<(string | null)[]>(() =>
  computePageLabels(pages.value.map(flagsFromHtml), {
    showPageNumbers: showPageNumbers.value,
    start: pageNumberStart.value,
  }),
);

const { isPrinting, printDocument } = useScriptoriumPrint();

function exportPdf() {
  void printDocument({
    bodyHtml: previewHtml.value,
    title: title.value,
    theme: theme.value,
    pageSize: pageSize.value,
    inkFriendly: inkFriendly.value,
    isTwoColumn: isTwoColumn.value,
    showPageNumbers: showPageNumbers.value,
    footerText: footerText.value,
    pageNumberStart: pageNumberStart.value,
  });
}

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

<!--
  Editor ProseMirror styles live in src/assets/scriptorium-editor.css
  (imported globally via main.css) to keep this file within the 600-line
  soft limit. The .phb-editor class prefix provides the same scoping boundary
  as Vue's :deep() did here. To add or edit editor styles, edit that file.
-->
<style scoped>
/* Force Chromium's dark-mode UA sheet to use the app's card token for
   inputs/selects inside this component's dark containers. */
input:not([type="checkbox"]):not([type="radio"]),
select {
  background-color: var(--card);
  color: var(--foreground);
}
</style>
