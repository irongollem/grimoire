<template>
  <div class="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
    <ScriptoriumEditorToolbar
      :editor="editor"
      :show-block-picker="showBlockPicker"
      :show-cover-inspector="showCoverInspector"
      :selected-image-is-supabase="selectedImageIsSupabase"
      :has-doc="true"
      @open-asset-panel="showAssetPanel = true"
      @open-block-picker="showBlockPicker = true"
      @open-cover-inspector="showCoverInspector = true"
      @edit-in-illuminator="editInIlluminator"
      :can-place-on-page="flow !== null"
      @place-on-page="placeOnPage"
    />

    <!-- The themed galley: the sc-theme and look classes pull the book's own
         styling (src/assets/scriptorium/) onto the page being written. -->
    <div ref="scrollRef" class="relative min-h-0 flex-1 overflow-auto px-4 py-6">
      <!-- The sheet is the real page, drawn at a display scale by a transform,
           never CSS `zoom` (it lays text out again at the scaled size and a
           line can break differently). The box around it takes the scaled size
           so the scroll area matches what is drawn. -->
      <div class="mx-auto" :style="scaleBoxStyle">
        <div
          ref="sheetRef"
          class="relative origin-top-left"
          :style="{ width: `${geometry.width}px`, transform: `scale(${sheetScale})` }"
          :data-scale="sheetScale"
        >
          <EditorContent
            :editor="editor"
            class="phb-editor sc-theme"
            :class="[
              scriptoriumThemeClass(theme),
              { 'ink-friendly': inkFriendly, 'sc-sheet--column-strip': isTwoColumn },
            ]"
            :style="sheetStyle"
            data-testid="chapter-editor"
          />
          <EditorFurnitureLayer
            :editor="editor"
            :chapter-id="chapter.id"
            :furniture="furniture"
            :selected-id="selectedFurnitureId"
            :geometry="sheetGeometry"
          />
        </div>
      </div>
      <!-- AI Enhance: rewrite the selection, on credits (#992) -->
      <TextEnhanceBubble
        v-if="editor && enhanceAvailable"
        :editor="editor"
        context="Scriptorium document"
        :style-hint="SCRIPTORIUM_STYLE[docType]"
        :context-radius="CONTEXT_RADIUS"
      />
    </div>

    <footer class="flex shrink-0 items-center gap-4 border-t border-border bg-muted/20 px-4 py-1.5">
      <slot name="footer" />
      <span class="ml-auto text-caption italic text-muted-foreground">{{ wordCount }} words</span>
      <span v-if="pagesLabel" class="text-caption italic text-muted-foreground">{{ pagesLabel }}</span>
    </footer>

    <AssetInsertPanel :show="showAssetPanel" :editor="editor" @close="showAssetPanel = false" />
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
      @add-furniture="emit('addFurniture', $event)"
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
  </div>
</template>

<script setup lang="ts">
/**
 * One chapter of a book in a Tiptap editor, saving itself (#1115 story 13).
 *
 * Mounted once per chapter (the shell keys it on the chapter id), so a chapter
 * switch is a new editor and a new autosave: the one being left saves on its
 * way out (`saveNow`, which the chapter list awaits first, and the unmount
 * flush as the backstop).
 *
 * The autosave draft is only an edit counter. The body is a Tiptap document
 * that can be megabytes, and a deep watch over a copy of it on every keystroke
 * is exactly the cost chapters exist to avoid; the JSON is read once, when a
 * save actually goes out.
 */
import { computed, onMounted, onUnmounted, reactive, ref, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { JSONContent } from "@tiptap/core";
import { NodeSelection } from "@tiptap/pm/state";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { PageFlow, offsetWithin, pageAt, type PageFlowStorage } from "@/lib/tiptap/pageFlow";
import { FurnitureUnderlay } from "@/lib/tiptap/furnitureUnderlay";
import { createFurnitureItem } from "@/lib/scriptorium/furniture/model";
import { neighbourBlockId, placementFromBox } from "@/lib/scriptorium/furniture/editorPages";
import { useFurnitureEditing } from "@/composables/scriptorium/useFurnitureEditing";
import EditorFurnitureLayer from "@/components/scriptorium/EditorFurnitureLayer.vue";
import type { ChapterFlow } from "@/lib/scriptorium/pageFlow/types";
import { useAutosave, type AutosaveStatus } from "@/composables/useAutosave";
import { useSaveChapter } from "@/composables/scriptorium/useScriptoriumChapters";
import { useScriptoriumIlluminator } from "@/composables/scriptorium/useScriptoriumIlluminator";
import { cleanupRemovedRichTextImages } from "@/composables/useImageUpload";
import { countWords } from "@/lib/scriptorium/chapterTitle";
import { scriptoriumThemeClass } from "@/lib/scriptorium/looks";
import { pageGeometry, pageGeometryCssVars } from "@/lib/scriptorium/pageGeometry";
import { scaledBoxSize } from "@/composables/scriptorium/useScriptoriumZoom";
import { useEnhanceAvailable } from "@/ai/useTextEnhancement";
import TextEnhanceBubble from "@/components/common/ai/TextEnhanceBubble.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import AssetInsertPanel from "@/components/scriptorium/AssetInsertPanel.vue";
import BlockPickerPanel from "@/components/scriptorium/BlockPickerPanel.vue";
import CoverPageInspector from "@/components/scriptorium/CoverPageInspector.vue";
import ScriptoriumEditorToolbar from "@/components/scriptorium/ScriptoriumEditorToolbar.vue";
import type {
  FurnitureAnchor,
  FurnitureKind,
  PageFurnitureItem,
  ScriptoriumChapter,
  ScriptoriumDocType,
  ScriptoriumPageSize,
  ScriptoriumTheme,
} from "@/types/scriptorium.types";

const {
  chapter,
  documentId,
  theme,
  docType,
  pageSize,
  isTwoColumn,
  inkFriendly,
  pagesLabel = null,
  flow = null,
  furniture,
  selectedFurnitureId,
} = defineProps<{
  chapter: ScriptoriumChapter;
  documentId: string;
  theme: ScriptoriumTheme;
  docType: ScriptoriumDocType;
  pageSize: ScriptoriumPageSize;
  isTwoColumn: boolean;
  inkFriendly: boolean;
  /** "Pages 175 to 191", from the layout, when the book has been laid out. */
  pagesLabel?: string | null;
  /** Where the preview starts this chapter's pages and columns; null shows one continuous sheet. */
  flow?: ChapterFlow | null;
  /** The book's page furniture: pictures placed on pages, drawn on the editor's pages in Split. */
  furniture: PageFurnitureItem[];
  selectedFurnitureId: string | null;
}>();

const emit = defineEmits<{
  /** The chapter's text changed (every edit): feeds the live preview. */
  edit: [json: JSONContent];
  status: [state: { status: AutosaveStatus; error: string }];
  /** The author typed (not a load): the shell flips an AI-drafted book's provenance on the first one. */
  userEdit: [];
  /** The editor exists: a block waiting to be focused can be. */
  ready: [];
  addFurniture: [kind: FurnitureKind];
  "update:furniture": [items: PageFurnitureItem[]];
  "update:selectedFurnitureId": [id: string | null];
}>();

const geometry = computed(() => pageGeometry(pageSize, isTwoColumn));
const sheetScale = ref(1);
const sheetHeight = ref(0);
const scrollRef = ref<HTMLElement | null>(null);
const sheetRef = ref<HTMLElement | null>(null);
// --sc-sheet-scale is read by later waves (a drag measured on screen needs it).
const sheetStyle = computed(() => ({
  ...pageGeometryCssVars(geometry.value),
  "--sc-sheet-scale": String(sheetScale.value),
}));
const scaleBoxStyle = computed(() => {
  const { width, height } = scaledBoxSize(
    { w: geometry.value.width, h: sheetHeight.value || geometry.value.height },
    sheetScale.value,
  );
  return { width: `${width}px`, height: `${height}px` };
});

/** Side padding of the scroll box (px-4 on both sides), in px: page geometry is px throughout. */
const PANE_GUTTER_PX = 32;
function measureSheet() {
  const pane = scrollRef.value;
  const sheet = sheetRef.value;
  if (!pane || !sheet) return;
  const available = pane.clientWidth - PANE_GUTTER_PX;
  sheetScale.value = available > 0 ? Math.min(1, available / geometry.value.width) : 1;
  sheetHeight.value = sheet.offsetHeight;
}
let sheetObserver: ResizeObserver | null = null;
onMounted(() => {
  measureSheet();
  if (typeof ResizeObserver === "undefined") return;
  sheetObserver = new ResizeObserver(measureSheet);
  if (scrollRef.value) sheetObserver.observe(scrollRef.value);
  if (sheetRef.value) sheetObserver.observe(sheetRef.value);
});
watch(geometry, () => measureSheet(), { flush: "post" });

const showAssetPanel = ref(false);
const showBlockPicker = ref(false);
const showCoverInspector = ref(false);
const showArtPicker = ref(false);

const wordCount = ref(countWords(chapter.content));

/** The body as the server last had it (or as last sent), serialised: what removed images are diffed against. */
let savedJson = JSON.stringify(chapter.content);
let sentJson = savedJson;

const draft = reactive({ edits: 0 });
const { mutateAsync: saveChapter } = useSaveChapter();

const editor = useEditor({
  content: chapter.content,
  // PageFlow and FurnitureUnderlay are the editor's alone: the pages of the preview, and a surface behind the text for art.
  extensions: [...createScriptoriumExtensions(), PageFlow, FurnitureUnderlay],
  onCreate({ editor: created }) {
    emit("edit", created.getJSON());
    emit("ready");
  },
  onUpdate({ editor: updated }) {
    const json = updated.getJSON();
    wordCount.value = countWords(json);
    draft.edits++;
    emit("edit", json);
    emit("userEdit");
  },
});

// The preview lays out on a debounce; each layout hands the editor its pages.
// The flow carries block ids, which the editor assigns just after it is
// created, so it is set once the editor exists.
watch(
  [() => flow, editor],
  ([value, ed]) => {
    if (ed && !ed.isDestroyed) ed.commands.setChapterFlow(value);
  },
  { immediate: true },
);

const autosave = useAutosave({
  draft,
  initial: () => ({ edits: 0 }),
  equal: (a, b) => a.edits === b.edits,
  async save() {
    const ed = editor.value;
    if (!ed) return;
    const content = ed.getJSON();
    const json = JSON.stringify(content);
    sentJson = json;
    const previous = savedJson;
    await saveChapter({ id: chapter.id, documentId, content });
    savedJson = json;
    cleanupRemovedRichTextImages(previous, json);
  },
  errorMessage: "Could not save your changes",
});

watch(
  () => [autosave.status.value, autosave.saveError.value] as const,
  ([status, error]) => emit("status", { status, error }),
  { immediate: true },
);

// The chapter changed on the server under us (another device, a restore). Our
// own save's echo is not that: it carries the JSON we just sent.
watch(
  () => chapter.updated_at,
  () => {
    const ed = editor.value;
    if (!ed || autosave.dirty.value || autosave.saving.value) return;
    const incoming = JSON.stringify(chapter.content);
    if (incoming === savedJson || incoming === sentJson) return;
    ed.commands.setContent(chapter.content, { emitUpdate: false });
    savedJson = incoming;
    sentJson = incoming;
    wordCount.value = countWords(chapter.content);
    emit("edit", chapter.content);
  },
);

/** Puts the cursor in a block (found by its stable id) and scrolls the page to it. */
function focusBlock(blockId: string): boolean {
  const ed = editor.value;
  if (!ed) return false;
  let target: number | null = null;
  ed.state.doc.descendants((node, pos) => {
    if (target !== null) return false;
    if (node.attrs?.blockId === blockId) {
      target = pos;
      return false;
    }
    return true;
  });
  if (target === null) return false;
  ed.chain().focus().setTextSelection(target + 1).run();
  void Promise.resolve().then(() => {
    document
      .querySelector(`.phb-editor [data-block-id="${CSS.escape(blockId)}"]`)
      ?.scrollIntoView({ block: "center", behavior: "smooth" });
  });
  return true;
}

/** The id of the top-level block at the cursor, for anchoring new furniture to it. */
function blockIdAtCursor(): string | null {
  const ed = editor.value;
  if (!ed) return null;
  try {
    const id = ed.state.selection.$from.node(1)?.attrs?.blockId;
    return typeof id === "string" && id ? id : null;
  } catch {
    return null;
  }
}

const sheetGeometry = computed(() => ({
  width: geometry.value.width,
  height: geometry.value.height,
  marginTop: geometry.value.margins.top,
}));

// Drag, resize and select furniture on the sheet. The container is the whole
// sheet, so a click anywhere outside an item (the text) deselects.
useFurnitureEditing({
  container: sheetRef,
  enabled: () => flow !== null,
  items: () => furniture,
  onChange: (items) => emit("update:furniture", items),
  onSelect: (id) => {
    if (id !== selectedFurnitureId) emit("update:selectedFurnitureId", id);
  },
});

/**
 * Turn the selected picture into art placed on its page: same place, same
 * width, in front of the text, and selected so it can be dragged at once. Only
 * offered while the editor shows the laid-out pages (the toolbar disables it in
 * Write mode), so there is always a page to measure it against.
 */
function placeOnPage() {
  const ed = editor.value;
  if (!ed || ed.isDestroyed) return;
  const { selection } = ed.state;
  if (!(selection instanceof NodeSelection) || selection.node.type.name !== "image") return;
  const src: unknown = selection.node.attrs.src;
  if (typeof src !== "string") return;

  const pages = (ed.storage as unknown as { pageFlow?: PageFlowStorage }).pageFlow?.pages ?? [];
  const page = pageAt(pages, selection.from);
  const $from = ed.state.doc.resolve(selection.from);
  let anchor: FurnitureAnchor = { type: "page", chapterId: chapter.id, page: 1 };
  let placed: { x?: number; y?: number; width?: number } = {};
  if (page) {
    // An image inside a paragraph belongs to that block; a block image to its neighbour.
    const own: unknown = $from.depth >= 1 ? $from.node(1).attrs.blockId : null;
    const siblings = Array.from({ length: ed.state.doc.childCount }, (_, i) => {
      const id: unknown = ed.state.doc.child(i).attrs.blockId;
      return typeof id === "string" && id ? id : null;
    });
    const blockId = typeof own === "string" && own ? own : neighbourBlockId(siblings, $from.index(0));
    anchor = blockId ? { type: "block", blockId } : { type: "page", chapterId: chapter.id, page: page.page };
    const dom = ed.view.nodeDOM(selection.from);
    if (dom instanceof HTMLElement) {
      // The image may be wrapped; the picture itself is what is drawn.
      const img = dom instanceof HTMLImageElement ? dom : (dom.querySelector("img") ?? dom);
      const { top, left } = offsetWithin(img, ed.view.dom as HTMLElement);
      placed = placementFromBox({ top, left, width: img.offsetWidth }, page, sheetGeometry.value);
    }
  }
  const item = createFurnitureItem("art", anchor, { ...placed, z: "over", props: { src } });
  ed.chain().focus().deleteSelection().run();
  emit("update:furniture", [...furniture, item]);
  emit("update:selectedFurnitureId", item.id);
}

const { selectedImageIsSupabase, editInIlluminator } = useScriptoriumIlluminator(
  editor,
  computed(() => documentId),
  computed(() => chapter.id),
);

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
const enhanceAvailable = useEnhanceAvailable();

onUnmounted(() => {
  sheetObserver?.disconnect();
  editor.value?.destroy();
});

defineExpose({
  editor,
  saveNow: autosave.saveNow,
  focusBlock,
  blockIdAtCursor,
  dirty: autosave.dirty,
  hold: autosave.hold,
  release: autosave.release,
});
</script>
