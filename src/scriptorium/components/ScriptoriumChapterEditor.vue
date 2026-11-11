<template>
  <div ref="rootRef" class="flex min-h-0 min-w-0 flex-1 flex-col bg-card">
    <ScriptoriumEditorToolbar
      :editor="editor"
      :show-block-picker="showBlockPicker"
      @open-asset-panel="showAssetPanel = true"
      @open-block-picker="showBlockPicker = true"
      @show-cover="dismissedKey = null"
    />

    <div class="flex min-h-0 flex-1">
      <!-- The themed galley: the sc-theme and look classes pull the book's own
           styling (src/scriptorium/styles/) onto the page being written. -->
      <div ref="scrollRef" class="relative min-h-0 min-w-0 flex-1 overflow-auto px-4 py-6">
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
            @pointermove="onSheetPointerMove"
            @pointerleave="onSheetPointerLeave"
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
              ref="furnitureLayerRef"
              :editor="editor"
              :chapter-id="chapter.id"
              :furniture="furniture"
              :selected-id="selectedFurnitureId"
              :geometry="sheetGeometry"
              @moved="onFurnitureMoved"
              @update:furniture="emit('update:furniture', $event)"
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

      <!-- The panel beside the page, never over it. From 87.5rem it is always there; below that it
           opens when something is selected and the page gives it room (it shrinks to fit), and
           closes when the writer clicks back into the text or presses its close button. Focus hides it. -->
      <aside
        v-if="!panelHidden"
        aria-label="Page panel"
        data-testid="panel-aside"
        :inert="panelOpen ? undefined : true"
        class="shrink-0 overflow-hidden border-border bg-card transition-[width] duration-200 motion-reduce:transition-none"
        :class="panelOpen ? 'w-80 border-l' : 'w-0'"
      >
        <ScriptoriumPanel
          :selection="selection"
          :editor="editor"
          :version="selectionVersion"
          :chapter-id="chapter.id"
          :furniture="furniture"
          :pictures="pictures"
          :context="pageContext"
          :can-edit-node-picture="selectedImageIsSupabase"
          :closable="!wide"
          @close="closePanel"
          @open-settings="emit('openSettings')"
          @add-furniture="emit('addFurniture', $event)"
          @update-item="updateItem"
          @select-furniture="emit('update:selectedFurnitureId', $event)"
          @edit-picture="editInIlluminator"
        />
      </aside>
    </div>

    <footer class="flex shrink-0 items-center gap-4 border-t border-border bg-muted/20 px-4 py-1.5">
      <slot name="footer" />
      <!-- Said quietly, and only for a few seconds: a layout carried a picture along with its paragraph. -->
      <span v-if="movedNotice" role="status" class="text-caption italic text-muted-foreground" data-testid="picture-moved">
        {{ movedNotice }}
      </span>
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
import { useMediaQuery } from "@vueuse/core";
import { prefersReducedMotion } from "@/lib/motion";
import { createScriptoriumExtensions } from "@/scriptorium/lib/scriptoriumExtensions";
import { PageFlow } from "@/scriptorium/tiptap/pageFlow";
import { FurnitureUnderlay } from "@/scriptorium/tiptap/furnitureUnderlay";
import { movedNoticeText } from "@/scriptorium/lib/furniture/movedNotice";
import { useFurnitureEditing } from "@/scriptorium/composables/useFurnitureEditing";
import { useEditorPictures } from "@/scriptorium/composables/useEditorPictures";
import { selectionKey, useScriptoriumSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import type { PanelPageContext } from "@/scriptorium/lib/panel/pageInfo";
import EditorFurnitureLayer from "@/scriptorium/components/EditorFurnitureLayer.vue";
import type { ChapterFlow } from "@/scriptorium/lib/pageFlow/types";
import { useAutosave, type AutosaveStatus } from "@/composables/useAutosave";
import { useSaveChapter } from "@/scriptorium/composables/useScriptoriumChapters";
import { useScriptoriumIlluminator } from "@/scriptorium/composables/useScriptoriumIlluminator";
import { cleanupRemovedRichTextImages } from "@/composables/useImageUpload";
import { countWords } from "@/scriptorium/lib/chapterTitle";
import { scriptoriumThemeClass } from "@/scriptorium/lib/looks";
import { pageGeometry, pageGeometryCssVars } from "@/scriptorium/lib/pageGeometry";
import { scaledBoxSize } from "@/scriptorium/composables/useScriptoriumZoom";
import { useEnhanceAvailable } from "@/ai/useTextEnhancement";
import TextEnhanceBubble from "@/components/common/ai/TextEnhanceBubble.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import AssetInsertPanel from "@/scriptorium/components/AssetInsertPanel.vue";
import BlockPickerPanel from "@/scriptorium/components/BlockPickerPanel.vue";
import ScriptoriumPanel from "@/scriptorium/components/panel/ScriptoriumPanel.vue";
import ScriptoriumEditorToolbar from "@/scriptorium/components/ScriptoriumEditorToolbar.vue";
import type {
  FurnitureKind,
  PageFurnitureItem,
  ScriptoriumChapter,
  ScriptoriumDocType,
  ScriptoriumPageSize,
  ScriptoriumTheme,
} from "@/scriptorium/types";

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
  pageContext,
  panelHidden = false,
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
  /** What the panel says about the page: the paper, the chapter's place, the book's page numbers. */
  pageContext: PanelPageContext;
  /** Focus hides the panel with the chapter list. */
  panelHidden?: boolean;
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
  /** The panel's "Book settings" link. */
  openSettings: [];
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
const furnitureLayerRef = ref<InstanceType<typeof EditorFurnitureLayer> | null>(null);
useFurnitureEditing({
  container: sheetRef,
  enabled: () => flow !== null,
  // Pictures behind the text: a press where there is no text, or on the hover handle.
  hitTest: (e) => furnitureLayerRef.value?.hitTest(e) ?? null,
  items: () => furniture,
  onChange: (items) => emit("update:furniture", items),
  onSelect: (id) => {
    if (id !== selectedFurnitureId) emit("update:selectedFurnitureId", id);
  },
});

// Hover over the sheet: the handle for a picture behind the text, and a move
// cursor where a press would pick one. At most once per animation frame.
let hoverFrame = 0;
let hoverPoint: { x: number; y: number } | null = null;
function onSheetPointerMove(e: PointerEvent) {
  if (flow === null || e.buttons !== 0) return;
  hoverPoint = { x: e.clientX, y: e.clientY };
  if (hoverFrame) return;
  hoverFrame = requestAnimationFrame(() => {
    hoverFrame = 0;
    const sheet = sheetRef.value;
    const point = hoverPoint;
    if (!sheet || !point) return;
    sheet.style.cursor = furnitureLayerRef.value?.hover(point) ? "move" : "";
  });
}
function onSheetPointerLeave() {
  cancelAnimationFrame(hoverFrame);
  hoverFrame = 0;
  hoverPoint = null;
  furnitureLayerRef.value?.clearHover();
  if (sheetRef.value) sheetRef.value.style.cursor = "";
}
onUnmounted(() => cancelAnimationFrame(hoverFrame));

/** The footer line shown for a few seconds after a layout carries a picture to another page. */
const movedNotice = ref("");
const NOTICE_MS = 6000;
let noticeTimer: ReturnType<typeof setTimeout> | undefined;
function onFurnitureMoved(pages: number[]) {
  movedNotice.value = movedNoticeText(pages);
  clearTimeout(noticeTimer);
  noticeTimer = setTimeout(() => (movedNotice.value = ""), NOTICE_MS);
}
onUnmounted(() => clearTimeout(noticeTimer));

const { selectedImageIsSupabase, editInIlluminator } = useScriptoriumIlluminator(
  editor,
  computed(() => documentId),
  computed(() => chapter.id),
);

// ── The panel beside the page (#1176) ───────────────────────────────────────
const rootRef = ref<HTMLElement | null>(null);
const { selection, version: selectionVersion } = useScriptoriumSelection({
  editor,
  furniture: () => {
    const item = furniture.find((f) => f.id === selectedFurnitureId);
    return item ? { id: item.id, kind: item.kind } : null;
  },
});
const pictures = useEditorPictures({
  editor,
  chapterId: () => chapter.id,
  geometry: () => sheetGeometry.value,
  furniture: () => furniture,
  setFurniture: (items) => emit("update:furniture", items),
  select: (id) => emit("update:selectedFurnitureId", id),
  sheet: () => sheetRef.value,
});
function updateItem(item: PageFurnitureItem) {
  emit("update:furniture", furniture.map((f) => (f.id === item.id ? item : f)));
}

/** From this width the page and the panel sit side by side with room to spare; below it the panel comes and goes. */
const wide = useMediaQuery("(width >= 87.5rem)");
/** The selection the writer closed the panel on; a different selection opens it again. */
const dismissedKey = ref<string | null>(null);
const closedOn = computed(() => selectionKey(selection.value));
const panelOpen = computed(() => {
  if (wide.value) return true;
  return selection.value.kind !== "page" && dismissedKey.value !== closedOn.value;
});
function closePanel() {
  dismissedKey.value = closedOn.value;
}
// Clicking back into the text ends the dismissal: the same picture selected later opens the panel again.
watch(selection, (now) => {
  if (now.kind === "page") dismissedKey.value = null;
});

// The two-column warning offers "Place it on the page instead": it asks from inside the text, by event.
function onPlaceOnPage(event: Event) {
  if (!(event instanceof CustomEvent)) return;
  const detail: unknown = event.detail;
  const pos = typeof detail === "object" && detail !== null && "pos" in detail ? detail.pos : null;
  if (typeof pos === "number") pictures.placeOnPage(pos);
}
onMounted(() => rootRef.value?.addEventListener("sc-place-on-page", onPlaceOnPage));
onUnmounted(() => rootRef.value?.removeEventListener("sc-place-on-page", onPlaceOnPage));

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

/**
 * Brings page `page` of this chapter into view (the export's print check names
 * pages). Page 1 is the top of the sheet; a later page starts at its gap, which
 * exists once the chapter is laid out, so this says whether it found it.
 */
function scrollToPage(page: number): boolean {
  const ed = editor.value;
  if (!ed || ed.isDestroyed) return false;
  const root = ed.view.dom as HTMLElement;
  const target = page <= 1 ? root : root.querySelector<HTMLElement>(`.sc-flow-gap[data-page="${page}"]`);
  if (!target) return false;
  target.scrollIntoView({ block: "start", behavior: prefersReducedMotion() ? "auto" : "smooth" });
  return true;
}

defineExpose({
  editor,
  saveNow: autosave.saveNow,
  focusBlock,
  scrollToPage,
  blockIdAtCursor,
  dirty: autosave.dirty,
  hold: autosave.hold,
  release: autosave.release,
});
</script>
