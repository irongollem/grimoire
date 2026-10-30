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
      @set-image-pos="setImagePos"
    />

    <!-- The themed galley: the sc-theme and look classes pull the book's own
         styling (src/assets/scriptorium/) onto the page being written. -->
    <div class="relative min-h-0 flex-1 overflow-auto px-4 py-6 sm:px-8">
      <EditorContent
        :editor="editor"
        class="phb-editor sc-theme mx-auto h-full max-w-3xl"
        :class="[scriptoriumThemeClass(theme), { 'ink-friendly': inkFriendly }]"
        data-testid="chapter-editor"
      />
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
import { computed, onUnmounted, reactive, ref, watch } from "vue";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import type { JSONContent } from "@tiptap/core";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { useAutosave, type AutosaveStatus } from "@/composables/useAutosave";
import { useSaveChapter } from "@/composables/scriptorium/useScriptoriumChapters";
import { useScriptoriumIlluminator } from "@/composables/scriptorium/useScriptoriumIlluminator";
import { cleanupRemovedRichTextImages } from "@/composables/useImageUpload";
import { countWords } from "@/lib/scriptorium/chapterTitle";
import { scriptoriumThemeClass } from "@/lib/scriptorium/looks";
import { useEnhanceAvailable } from "@/ai/useTextEnhancement";
import TextEnhanceBubble from "@/components/common/ai/TextEnhanceBubble.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import AssetInsertPanel from "@/components/scriptorium/AssetInsertPanel.vue";
import BlockPickerPanel from "@/components/scriptorium/BlockPickerPanel.vue";
import CoverPageInspector from "@/components/scriptorium/CoverPageInspector.vue";
import ScriptoriumEditorToolbar from "@/components/scriptorium/ScriptoriumEditorToolbar.vue";
import type {
  FurnitureKind,
  ScriptoriumChapter,
  ScriptoriumDocType,
  ScriptoriumTheme,
} from "@/types/scriptorium.types";

const {
  chapter,
  documentId,
  theme,
  docType,
  isTwoColumn,
  inkFriendly,
  pagesLabel = null,
} = defineProps<{
  chapter: ScriptoriumChapter;
  documentId: string;
  theme: ScriptoriumTheme;
  docType: ScriptoriumDocType;
  isTwoColumn: boolean;
  inkFriendly: boolean;
  /** "Pages 175 to 191", from the layout, when the book has been laid out. */
  pagesLabel?: string | null;
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
}>();

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
  extensions: createScriptoriumExtensions(),
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
  errorMessage: "Could not save this chapter",
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

function setImagePos(side: "posTop" | "posLeft" | "posRight" | "posBottom", value: string) {
  editor.value
    ?.chain()
    .focus()
    .updateAttributes("image", { [side]: value || null })
    .run();
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
