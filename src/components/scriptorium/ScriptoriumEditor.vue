<template>
  <AssetInsertPanel
    :show="showAssetPanel"
    :editor="editor"
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
    @add-furniture="addFurniture"
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
  <FurnitureInspector
    :item="selectedFurniture"
    @update="updateFurniture"
    @delete="deleteFurniture"
    @close="selectedFurnitureId = null"
  />

  <div class="flex flex-col gap-3 lg:h-full">
    <!-- Metadata row -->
    <ScriptoriumMetadataToolbar
      :title="title"
      :doc-type="docType"
      :campaign-id="campaignId"
      :campaign-options="campaignOptions"
      :is-published="isPublished"
      :show-page-numbers="showPageNumbers"
      :footer-text="footerText"
      :page-number-start="pageNumberStart"
      :is-saving="isSaving"
      :is-deleting="isDeleting"
      :is-new="!props.doc"
      :save-blocked="contentError !== null"
      @update:title="title = $event"
      @update:doc-type="docType = $event as ScriptoriumDocType"
      @update:campaign-id="campaignId = $event"
      @update:is-published="isPublished = $event"
      @update:show-page-numbers="showPageNumbers = $event"
      @update:footer-text="footerText = $event"
      @update:page-number-start="pageNumberStart = $event"
      @save="save"
      @delete="destroy"
    />

    <!-- Tags row -->
    <TagInput v-model="tags" />

    <DraftConflictNotice :fields="conflictLabels" :on-discard="discardEdits" />

    <p v-if="saveError" class="text-destructive text-body">
      {{ saveError }}
    </p>

    <!-- Unreadable content (#915 story 2): stored content that isn't valid
         current-version Tiptap JSON. No silent HTML fallback — see
         documentContent.ts. Save is blocked (saveBlocked on the toolbar
         and the guard in save()) so a misclick cannot overwrite the only
         copy with a blank document. -->
    <EmptyState
      v-if="contentError"
      title="This document could not be read"
      description="Its saved content isn't valid Scriptorium content. Saving is turned off so the original isn't overwritten. Delete it if you don't want to keep this record."
    >
      <template #icon>
        <IconWarning class="h-16 w-16" />
      </template>
    </EmptyState>

    <!-- Editor / Preview split -->
    <div v-else class="grid grid-cols-1 lg:grid-cols-2 gap-3 lg:flex-1 lg:min-h-0">
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
                class="flex items-center gap-1.5 px-2.5 py-1.5 font-cinzel text-xs font-semibold tracking-wide text-primary hover:bg-primary/10 transition-colors disabled:opacity-50"
                @click="onEnhance"
              >
                <BannerLoader v-if="isEnhancing" class="h-3" />
                <IconWand v-else class="h-3 w-3" />
                Enhance
              </button>
            </div>
          </BubbleMenu>

          <!-- Inline error feedback -->
          <Transition name="enhance-error">
            <div
              v-if="enhanceError"
              class="absolute bottom-2 left-2 right-2 z-30 rounded-md bg-destructive/90 px-3 py-2 text-caption text-white shadow-lg"
            >
              {{ enhanceError }}
            </div>
          </Transition>
        </div>

        <!-- Word count footer -->
        <div class="px-4 py-1.5 border-t border-border bg-muted/20 flex justify-end shrink-0">
          <span class="text-caption text-muted-foreground italic">{{ wordCount }} words</span>
        </div>
      </div>

      <!-- Preview pane -->
      <ScriptoriumPreviewPane
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
        :furniture="furniture"
        :selected-furniture-id="selectedFurnitureId"
        @export-pdf="exportPdf"
        @edit-block="focusBlock"
        @update:furniture="furniture = $event"
        @update:selected-furniture-id="selectedFurnitureId = $event"
      />
    </div>
  </div>

  <PaywallModal v-model="showPaywall" resource="scriptorium_documents" />
</template>

<script setup lang="ts">
import BannerLoader from "@/components/brand/BannerLoader.vue";
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed, nextTick, onUnmounted, provide, toRefs, watch } from "vue";
import { useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { storeToRefs } from "pinia";
import { useRouter } from "vue-router";
import { useCampaignStore } from "@/stores/campaign";
import { useAllDmCampaigns } from "@/composables/campaign/useCampaigns";
import { useEditor, EditorContent } from "@tiptap/vue-3";
import { BubbleMenu } from "@tiptap/vue-3/menus";
import { createScriptoriumExtensions } from "@/lib/scriptorium/scriptoriumExtensions";
import { useScriptoriumIlluminator } from "@/composables/scriptorium/useScriptoriumIlluminator";
import { IconWand } from "@/lib/icons";
import {
  useCreateScriptoriumDocument,
  useUpdateScriptoriumDocument,
  useDeleteScriptoriumDocument,
} from "@/composables/scriptorium/useScriptorium";
import {
  removeRichTextImages,
  cleanupRemovedRichTextImages,
} from "@/composables/useImageUpload";
import { useScriptoriumPrint } from "@/composables/scriptorium/useScriptoriumPrint";
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
import { parseMarkdown } from "@/lib/tiptap/markdownToTiptap";
import type { JSONContent } from "@tiptap/core";
import type { ScriptoriumTemplateSettings } from "@/data/scriptoriumTemplates/types";
import type { PageFurnitureItem, FurnitureKind, FurnitureAnchor } from "@/types/scriptorium.types";
import { createFurnitureItem } from "@/lib/scriptorium/furniture/model";
import { parseStoredContent } from "@/lib/scriptorium/documentContent";
import FurnitureInspector from "@/components/scriptorium/FurnitureInspector.vue";
import { collectEntityRefs, resolveEntityEmbeds } from "@/lib/scriptorium/entityEmbeds";
import { useEntityEmbedData } from "@/composables/scriptorium/useEntityEmbedData";
import { SCRIPTORIUM_THEME_KEY } from "@/lib/scriptorium/scriptoriumTheme";
import EmptyState from "@/components/common/EmptyState.vue";
import { IconWarning } from "@/lib/icons";

const props = defineProps<{
  doc: ScriptoriumDocument | null;
  /** For a NEW document, pre-populate content + settings from a gallery template. */
  seed?: { docType: ScriptoriumDocType; content: JSONContent; settings: ScriptoriumTemplateSettings } | null;
}>();
const router = useRouter();

// Panels
const showAssetPanel = ref(false);
const showBlockPicker = ref(false);
const showCoverInspector = ref(false);
const showArtPicker = ref(false);

// Metadata, held as a draft of the document as the server last reported it
// (#946): a field the author has not touched follows the server when the
// document refetches, and save() sends only the columns they changed. The body
// is the exception, it lives in the Tiptap editor and is tracked below.
// For a new document seeded from a template, fall back to the template's
// docType/settings before the hard defaults.
const seedSettings = props.seed?.settings;

// Campaign scope (#915). An existing document keeps its own scope; a new one
// defaults to whatever campaign is active, or account-wide if none is.
const { activeCampaignId } = storeToRefs(useCampaignStore());

interface DocDraft {
  title: string;
  docType: ScriptoriumDocType;
  campaignId: string | null;
  isPublished: boolean;
  isTwoColumn: boolean;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  tags: string[];
  showPageNumbers: boolean;
  footerText: string;
  pageNumberStart: number;
  furniture: PageFurnitureItem[];
}

function toDraft(doc: ScriptoriumDocument | null): DocDraft {
  return {
    title: doc?.title ?? "",
    docType: doc?.doc_type ?? props.seed?.docType ?? "custom",
    campaignId: doc ? doc.campaign_id : activeCampaignId.value,
    isPublished: doc?.is_published ?? false,
    isTwoColumn: doc?.is_two_column ?? seedSettings?.isTwoColumn ?? false,
    theme: doc?.theme ?? seedSettings?.theme ?? "onednd2024",
    pageSize: doc?.page_size ?? seedSettings?.pageSize ?? "A4",
    inkFriendly: doc?.ink_friendly ?? seedSettings?.inkFriendly ?? false,
    tags: [...(doc?.tags ?? seedSettings?.tags ?? [])],
    showPageNumbers: doc?.show_page_numbers ?? seedSettings?.showPageNumbers ?? false,
    footerText: doc?.footer_text ?? seedSettings?.footerText ?? "",
    pageNumberStart: doc?.page_number_start ?? seedSettings?.pageNumberStart ?? 1,
    furniture: [...(doc?.page_furniture ?? [])],
  };
}

const { draft, conflicts, changes, commit, reset: resetDraft } = useRecordDraft({
  source: () => props.doc,
  identity: (doc) => doc.id,
  toDraft,
});
const {
  title, docType, campaignId, isPublished, isTwoColumn, theme, pageSize,
  inkFriendly, tags, showPageNumbers, footerText, pageNumberStart, furniture,
} = toRefs(draft);
// Read by entityEmbed node views (EntityEmbedView.vue) so their stat blocks
// format themselves in the document's own theme rather than a hardcoded
// default (#917 story 2) — see scriptoriumTheme.ts's own doc.
provide(SCRIPTORIUM_THEME_KEY, theme);

// A pure function of its draft: useRecordDraft runs it over the server copy too.
function buildRow(d: DocDraft) {
  return {
    title: d.title.trim(),
    doc_type: d.docType,
    campaign_id: d.campaignId,
    tags: d.tags,
    is_published: d.isPublished,
    is_two_column: d.isTwoColumn,
    theme: d.theme,
    page_size: d.pageSize,
    ink_friendly: d.inkFriendly,
    show_page_numbers: d.showPageNumbers,
    footer_text: d.footerText,
    page_number_start: d.pageNumberStart,
    page_furniture: d.furniture,
  };
}

const CONFLICT_LABELS: Record<keyof DocDraft, string> = {
  title: "Title",
  docType: "Type",
  campaignId: "Campaign",
  isPublished: "Published",
  isTwoColumn: "Two columns",
  theme: "Theme",
  pageSize: "Page size",
  inkFriendly: "Ink friendly",
  tags: "Tags",
  showPageNumbers: "Page numbers",
  footerText: "Footer text",
  pageNumberStart: "First page number",
  furniture: "Page furniture",
};
// The body is not a draft field; it joins the list when the stored body moved
// on while the author had unsaved edits in the editor.
const bodyConflict = ref(false);
const conflictLabels = computed(() => [
  ...conflicts.value.map((key) => CONFLICT_LABELS[key]),
  ...(bodyConflict.value ? ["Document text"] : []),
]);

// Every campaign this account DMs, archived included — the toolbar's scope
// select needs names for the active campaign and, when it differs, the
// document's own campaign (a doc created elsewhere, or the DM has since
// switched campaigns). Archived is included so that case still resolves a
// name instead of falling back to "Unknown campaign".
const { data: dmCampaigns } = useAllDmCampaigns();
function campaignName(id: string): string {
  return dmCampaigns.value?.find((c) => c.id === id)?.name ?? "Unknown campaign";
}
const campaignOptions = computed(() => {
  const options: Array<{ value: string | null; label: string }> = [];
  if (activeCampaignId.value) {
    options.push({ value: activeCampaignId.value, label: campaignName(activeCampaignId.value) });
  }
  if (campaignId.value && campaignId.value !== activeCampaignId.value) {
    options.push({ value: campaignId.value, label: campaignName(campaignId.value) });
  }
  options.push({ value: null, label: "All my campaigns" });
  return options;
});

// Initial content + furniture. Stored content is already current-version
// JSON (every write path has been JSON since #915 story 3) — parseStoredContent
// does no migration and no HTML fallback; an unreadable row surfaces as
// `contentError` and the editor/preview pane is replaced by a visible message
// rather than silently handing broken content to Tiptap.
const contentError = ref<Error | null>(null);
function computeInitialDoc(): { content: JSONContent | string } {
  if (props.doc?.content) {
    try {
      return { content: parseStoredContent(props.doc.content) };
    } catch (e: unknown) {
      contentError.value = e instanceof Error ? e : new Error(String(e));
      return { content: "" };
    }
  }
  return { content: props.seed?.content ?? "" };
}
const initialDoc = computeInitialDoc();

// Page furniture (Phase D) — decorations anchored to pages/blocks, dragged on
// the book. A draft field alongside the metadata; the selected item drives the inspector.
const selectedFurnitureId = ref<string | null>(null);
const selectedFurniture = computed(
  () => furniture.value.find((f) => f.id === selectedFurnitureId.value) ?? null,
);

/** Anchor new furniture to the top-level block at the cursor (so it follows
 *  that content across reflows), falling back to page 1. */
function currentFurnitureAnchor(): FurnitureAnchor {
  const ed = editor.value;
  if (ed) {
    try {
      const id = ed.state.selection.$from.node(1)?.attrs?.blockId;
      if (typeof id === "string" && id) return { type: "block", blockId: id };
    } catch {
      /* selection has no depth-1 node — fall through to page anchor */
    }
  }
  return { type: "page", page: 1 };
}

function addFurniture(kind: FurnitureKind) {
  const item = createFurnitureItem(kind, currentFurnitureAnchor());
  furniture.value = [...furniture.value, item];
  selectedFurnitureId.value = item.id;
}

function updateFurniture(updated: PageFurnitureItem) {
  furniture.value = furniture.value.map((f) => (f.id === updated.id ? updated : f));
}

function deleteFurniture(id: string) {
  furniture.value = furniture.value.filter((f) => f.id !== id);
  if (selectedFurnitureId.value === id) selectedFurnitureId.value = null;
}

// Editor
const rawHtml = ref("");
// Only populated while the document actually holds an entityEmbed node (see
// updateDerived below) — collectEntityRefs handles null as "no refs", and this
// skips a full-document getJSON() serialization on every keystroke for the
// common case of a document with no linked entities. usePagedPreview's own
// debounce already keeps the expensive Paged.js layout out of the typing
// path; this is the same idea one level up, for the synchronous work that
// runs on every keystroke regardless of that debounce.
const rawJson = ref<JSONContent | null>(null);
const wordCount = ref(0);

function updateDerived(editor: { getHTML: () => string; getJSON: () => JSONContent; getText: () => string }) {
  const html = editor.getHTML();
  rawHtml.value = html;
  rawJson.value = html.includes('data-type="entity-embed"') ? editor.getJSON() : null;
  const text = editor.getText();
  wordCount.value = text.trim() ? text.trim().split(/\s+/).length : 0;
}

// The body as the server last had it, in the editor's own serialisation: set when
// the editor opens, when stored content is loaded into it, and when a save lands.
// "Did the author edit the body" is the editor differing from this, so a body
// they never touched is not written back over a newer one (#946). The stored
// string is tracked beside it to notice when the server's copy changes.
let editorBaseline = "";
let knownServerContent: string | null = props.doc?.content ?? null;

const editor = useEditor({
  content: initialDoc.content,
  extensions: createScriptoriumExtensions(),
  onCreate({ editor }) {
    updateDerived(editor);
    editorBaseline = JSON.stringify(editor.getJSON());
  },
  onUpdate({ editor }) {
    updateDerived(editor);
  },
});

function bodyEdited(): boolean {
  return !!editor.value && JSON.stringify(editor.value.getJSON()) !== editorBaseline;
}

function loadStoredBody(stored: string) {
  const ed = editor.value;
  if (!ed) return;
  try {
    ed.commands.setContent(parseStoredContent(stored), { emitUpdate: false });
    contentError.value = null;
  } catch (e: unknown) {
    contentError.value = e instanceof Error ? e : new Error(String(e));
    return;
  }
  updateDerived(ed);
  editorBaseline = JSON.stringify(ed.getJSON());
  knownServerContent = stored;
  bodyConflict.value = false;
}

// A body saved elsewhere reaches the editor unless the author is mid-edit, in
// which case their text stays and the notice says the stored one moved. A
// different document in the same editor loads whole. The first save of a new
// document (no id yet, then its own id) is neither: the editor already holds it.
watch(
  () => [props.doc?.id, props.doc?.content] as const,
  ([id, stored], [prevId]) => {
    if (id && prevId && id !== prevId) {
      if (stored) loadStoredBody(stored);
      return;
    }
    if (!stored || stored === knownServerContent) return;
    if (bodyEdited()) {
      knownServerContent = stored;
      bodyConflict.value = true;
      return;
    }
    loadStoredBody(stored);
  },
);

function discardEdits() {
  resetDraft();
  if (props.doc?.content) loadStoredBody(props.doc.content);
}

// Linked entities (#915 story 3): the preview/PDF pipeline stays HTML-string
// based (Paged.js lays out a string, not live Vue components), so the raw
// editor HTML's entityEmbed placeholders are resolved against current data
// here — the one place both the preview pane and exportPdf() read from. Both
// recompute automatically when the fetched entities change, since `lookup` is
// itself a computed.
const entityRefs = computed(() => collectEntityRefs(rawJson.value));
const { lookup: entityEmbedLookup } = useEntityEmbedData(entityRefs, { theme });
const previewHtml = computed(() => resolveEntityEmbeds(rawHtml.value, entityEmbedLookup.value));

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
  if (!title.value.trim() || contentError.value) return;
  isSaving.value = true;
  saveError.value = "";
  try {
    const content = JSON.stringify(editor.value?.getJSON() ?? {});
    if (props.doc) {
      // Only the columns the author changed, and the body only if they edited
      // it: the rest may have moved on the server since this loaded (#946).
      const bodyChanged = bodyEdited();
      const changed = {
        ...changes(buildRow),
        ...(bodyChanged ? { content, word_count: wordCount.value } : {}),
      };
      const oldContent = props.doc.content;
      if (Object.keys(changed).length > 0) await update({ id: props.doc.id, update: changed });
      commit();
      if (bodyChanged) {
        editorBaseline = JSON.stringify(editor.value?.getJSON() ?? {});
        knownServerContent = content;
        bodyConflict.value = false;
        cleanupRemovedRichTextImages(oldContent, content);
      }
    } else {
      const created = await create({
        ...buildRow(draft),
        content,
        word_count: wordCount.value,
      });
      editorBaseline = JSON.stringify(editor.value?.getJSON() ?? {});
      knownServerContent = content;
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
    furniture: furniture.value,
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
