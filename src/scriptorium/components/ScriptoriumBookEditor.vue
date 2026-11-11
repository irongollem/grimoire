<template>
  <div
    class="relative flex h-dvh min-h-0 flex-col bg-background"
    data-testid="book-editor"
  >
    <ScriptoriumBookHeader
      v-model:focus="focus"
      :title="settings.draft.title"
      :kind="settings.draft.kind"
      :status="status"
      :error="statusError"
      :can-share="canGive"
      :share-hint="giveHint"
      :is-exporting="isExporting"
      :progress="pdfProgress"
      @share="openShare"
      @export="openExport"
      @settings="showSettings = true"
      @read="reading = true"
    >
      <template #give>
        <HandoutShareControl
          :handout="doc"
          :active-campaign-name="activeCampaignId ? campaignName(activeCampaignId) : null"
          :prepare="prepareToGive"
          @move-to-campaign="moveToActiveCampaign"
        />
      </template>
    </ScriptoriumBookHeader>

    <div v-if="isHandout" class="shrink-0 border-b border-border px-4 py-2 sm:px-6">
      <HandoutAudienceLine :handout="doc" />
    </div>

    <div class="flex min-h-0 flex-1">
      <!-- The left rail: the chapters, and the book kit of blocks, entries and art to write with (frame 13). -->
      <div v-if="!focus" class="hidden w-68 shrink-0 flex-col border-r border-border md:flex" data-testid="left-rail">
        <SegmentedControl
          v-if="chapterList.length > 1"
          v-model="railTab"
          :options="RAIL_TABS"
          size="sm"
          block
          class="shrink-0 px-3 pt-2.5 pb-1"
          data-testid="rail-tabs"
        />
        <ChapterRail
          v-if="chapterList.length > 1 && railTab === 'chapters'"
          :document-id="doc.id"
          :chapters="chapterList"
          :current-id="currentId"
          :page-ranges="pageRanges"
          :numbering="numbering"
          :before-leave="saveCurrent"
          @select="selectChapter"
        />
        <BookKit
          v-show="railTab === 'kit' || chapterList.length <= 1"
          :editor="chapterEditor?.editor"
          :is-two-column="settings.draft.isTwoColumn"
        />
      </div>

      <div class="flex min-h-0 min-w-0 flex-1" :class="{ hidden: reading }">
        <div v-if="chapterList.length === 0 && !listLoading" class="m-auto">
          <EmptyState
            :title="isHandout ? 'This handout is blank' : 'This book has no chapters'"
            :description="isHandout ? 'Start writing on it.' : 'Add one to start writing.'"
          >
            <template #action>
              <AppButton variant="primary" size="md" :icon="IconAdd" :label="isHandout ? 'Start writing' : 'Add chapter'" @click="addChapter" />
            </template>
          </EmptyState>
        </div>
        <LoadingSpinner v-else-if="!chapter" class="m-auto" />
        <ScriptoriumChapterEditor
          v-else
          :key="chapter.id"
          ref="chapterEditor"
          :chapter="chapter"
          :document-id="doc.id"
          :theme="settings.draft.theme"
          :doc-type="doc.doc_type"
          :page-size="settings.draft.pageSize"
          :is-two-column="settings.draft.isTwoColumn"
          :ink-friendly="settings.draft.inkFriendly"
          :pages-label="pagesLabel"
          :flow="flow?.chapterId !== chapter.id ? null : flow"
          @edit="onEdit"
          @user-edit="onUserEdit"
          @status="onChapterStatus"
          @ready="onEditorReady"
          :furniture="settings.draft.furniture"
          :selected-furniture-id="selectedFurnitureId"
          @add-furniture="addFurniture"
          @update:furniture="settings.patch({ furniture: $event })"
          @update:selected-furniture-id="selectedFurnitureId = $event"
          :page-context="pageContext"
          :panel-hidden="focus"
          @open-settings="showSettings = true"
        >
          <!-- A handout is one chapter on one paper: it never grows a second (#1115). -->
          <template #footer>
            <AppButton
              v-if="chapterList.length <= 1 && !isHandout"
              variant="link"
              size="sm"
              :icon="IconAdd"
              label="Add chapter"
              :loading="creating"
              @click="addChapter"
            />
          </template>
        </ScriptoriumChapterEditor>
      </div>

    </div>

    <!-- The book is laid out whenever it is open. Off screen it only measures,
         for the editor's pages; Read as spreads shows it full screen. -->
    <ScriptoriumPreviewPane
      v-model:notes-open="notesOpen"
      :document-id="doc.id"
      :title="settings.draft.title"
      :chapters="html.chapters"
      :changes="html.version.value"
      :settings="layoutSettings"
      :chapter-summaries="chapterList"
      :reading="reading"
      :focus-chapter-id="currentId"
      :furniture="settings.draft.furniture"
      @layout="layout = $event"
      @progress="layoutProgress = $event"
      @flow="flow = $event"
      @close="reading = false"
    >
      <template #layer="{ host }">
        <InspectNotesLayer
          v-if="reading && host && layout"
          :document-id="doc.id"
          :host="host"
          :result="layout"
          :chapters="chapterList"
          @edit-block="editBlock"
        />
      </template>
      <template #drawer>
        <InspectNotesDrawer
          :document-id="doc.id"
          :chapters="chapterList"
          :result="layout"
          @go-to-note="editBlock"
        />
      </template>
    </ScriptoriumPreviewPane>

  <ScriptoriumBookSettings
    :open="showSettings"
    :draft="settings.draft"
    :chapter-count="chapterList.length"
    :campaign-options="campaignOptions"
    :status="settings.status.value"
    :error="settings.saveError.value"
    :deleting="deleting"
    @patch="settings.patch"
    @delete="destroy"
    @close="showSettings = false"
  />

  <ScriptoriumExportDialog
    v-if="showExport"
    :kind="settings.draft.kind"
    :document-title="settings.draft.title"
    :chapter-count="chapterList.length"
    :page-count="layout?.pageCount ?? null"
    :campaign-id="settings.draft.campaignId"
    :preselection="bundlePreselection(html.entityRefs.value, doc.id)"
    :run="runExport"
    :is-exporting="isExporting"
    :progress="pdfProgress"
    :export-error="exportError"
    :print-check="printCheck"
    @show-page="showPrintedPage"
    @close="showExport = false"
  />

  <HandoutShareDialog :open="showShare" :handout="doc" @close="showShare = false" />
  </div>
</template>

<script setup lang="ts">
/**
 * The editor for a book of chapters (#1115 story 13): the shell that holds one
 * chapter in the editor, the chapter list beside it, the layout behind it, and the book's
 * settings, and wires them together. Writing a chapter is ScriptoriumChapterEditor,
 * the pages are laid out by ScriptoriumPreviewPane, the book-wide options are
 * ScriptoriumBookSettings.
 *
 * Nothing here has a Save button: the open chapter and the settings save
 * themselves, a chapter switch saves the one being left first, and leaving the
 * page saves before it goes.
 */
import { computed, onBeforeUnmount, onMounted, provide, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import { storeToRefs } from "pinia";
import AppButton from "@/components/common/controls/AppButton.vue";
import EmptyState from "@/components/common/feedback/EmptyState.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import ChapterRail from "@/scriptorium/components/chapters/ChapterRail.vue";
import BookKit from "@/scriptorium/components/kit/BookKit.vue";
import InspectNotesDrawer from "@/scriptorium/components/inspect/InspectNotesDrawer.vue";
import InspectNotesLayer from "@/scriptorium/components/inspect/InspectNotesLayer.vue";
import HandoutAudienceLine from "@/scriptorium/components/HandoutAudienceLine.vue";
import HandoutShareControl from "@/scriptorium/components/HandoutShareControl.vue";
import HandoutShareDialog from "@/scriptorium/components/HandoutShareDialog.vue";
import ScriptoriumBookHeader from "@/scriptorium/components/ScriptoriumBookHeader.vue";
import ScriptoriumBookSettings from "@/scriptorium/components/ScriptoriumBookSettings.vue";
import ScriptoriumChapterEditor from "@/scriptorium/components/ScriptoriumChapterEditor.vue";
import ScriptoriumExportDialog from "@/scriptorium/components/ScriptoriumExportDialog.vue";
import ScriptoriumPreviewPane from "@/scriptorium/components/ScriptoriumPreviewPane.vue";
import { markEdited } from "@/ai/provenance";
import { useAllDmCampaigns } from "@/composables/campaign/useCampaigns";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";
import { useBookChapterHtml, type LiveChapter } from "@/scriptorium/composables/useBookChapterHtml";
import type { ChapterFlow } from "@/scriptorium/lib/pageFlow/types";
import { useBookSettings } from "@/scriptorium/composables/useBookSettings";
import { useUpdateScriptoriumDocument, useDeleteScriptoriumDocument } from "@/scriptorium/composables/useScriptorium";
import {
  useBookChapterList,
  useCreateChapter,
  useScriptoriumChapter,
} from "@/scriptorium/composables/useScriptoriumChapters";
import { useScriptoriumPdf } from "@/scriptorium/composables/useScriptoriumPdf";
import { removeRichTextImages } from "@/composables/useImageUpload";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import type { AutosaveStatus } from "@/composables/useAutosave";
import { IconAdd } from "@/lib/icons";
import { bundlePreselection } from "@/scriptorium/lib/bundlePreselection";
import { createFurnitureItem } from "@/scriptorium/lib/furniture/model";
import { scriptoriumLook } from "@/scriptorium/lib/looks";
import { paperLine, type PanelPageContext } from "@/scriptorium/lib/panel/pageInfo";
import { PRINTED_BOOK_KEY, createPrintedBook } from "@/scriptorium/composables/usePrintedBook";
import { FOOTER_SETTINGS_KEY } from "@/scriptorium/lib/footerTitle";
import { SCRIPTORIUM_THEME_KEY } from "@/scriptorium/lib/scriptoriumTheme";
import type { BookLayoutResult, BookLayoutSettings } from "@/scriptorium/lib/bookLayout/types";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useScriptoriumUiStore } from "@/scriptorium/stores/ui";
import type { JSONContent } from "@tiptap/core";
import type { FurnitureAnchor, FurnitureKind, ScriptoriumDocument } from "@/scriptorium/types";

const { doc } = defineProps<{ doc: ScriptoriumDocument }>();

const route = useRoute();
const router = useRouter();
const { confirm } = useConfirm();
const toast = useToast();

// ── The shell steps aside (sidebar and top bar) while a book is open ────────
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});

// ── Settings: the book's own row, saved by itself ───────────────────────────
const settings = useBookSettings(() => doc);
const isHandout = computed(() => settings.draft.kind === "handout");
const themeRef = computed(() => settings.draft.theme);
provide(SCRIPTORIUM_THEME_KEY, themeRef);
// What the printed book says (its contents page, how its entries were fitted): written by the preview after
// each layout, drawn by the page's contents block and linked entries.
provide(PRINTED_BOOK_KEY, createPrintedBook());
// A footer clicked on the page edits the same settings as Book settings (#1176 story 6).
provide(FOOTER_SETTINGS_KEY, { draft: settings.draft, patch: settings.patch });

const layoutSettings = computed<BookLayoutSettings>(() => ({
  pageSize: settings.draft.pageSize,
  isTwoColumn: settings.draft.isTwoColumn,
  showPageNumbers: settings.draft.showPageNumbers,
  pageNumberStart: settings.draft.pageNumberStart,
  footerText: settings.draft.footerText,
  footerTitle: settings.draft.footerTitle,
  bookTitle: settings.draft.title,
  inkFriendly: settings.draft.inkFriendly,
  theme: settings.draft.theme,
}));

// ── One surface: the page you write on ─────────────────────────────────────
// The book is laid out whenever it is open and the editor draws the real pages
// (Scriptorium One Surface). Focus lets the chapter list step aside; Read as
// spreads is a visit, never remembered, that Escape or Close returns from.
const { scriptoriumFocus: focus } = storeToRefs(useScriptoriumUiStore());
const reading = ref(false);
const notesOpen = ref(true);

// ── The left rail: chapters, and the book kit (frame 13) ────────────────────
type RailTab = "chapters" | "kit";
const RAIL_TABS: SegmentedOption<RailTab>[] = [
  { value: "chapters", label: "Chapters" },
  { value: "kit", label: "Book kit" },
];
const { scriptoriumRailTab: railTab } = storeToRefs(useScriptoriumUiStore());

// ── Chapters ────────────────────────────────────────────────────────────────
const docId = computed(() => doc.id);
const { data: chapterData, isLoading: listLoading } = useBookChapterList(docId);
const chapterList = computed(() => chapterData.value ?? []);

// Declared first: the watch below runs at once and reads it.
const chapterEditor = ref<InstanceType<typeof ScriptoriumChapterEditor> | null>(null);

const requested = typeof route.query.chapter === "string" ? route.query.chapter : "";
const currentId = ref(requested);
watch(
  chapterList,
  (list) => {
    if (list.length === 0) return;
    if (!list.some((c) => c.id === currentId.value)) {
      // The open chapter is gone (the list deleted it): nothing may write to it now.
      void chapterEditor.value?.hold();
      if (!currentId.value || chapterEditor.value === null) currentId.value = list[0].id;
    }
  },
  { immediate: true },
);

const { data: chapter } = useScriptoriumChapter(currentId);

async function saveCurrent(): Promise<void> {
  await chapterEditor.value?.saveNow();
  if (chapterEditor.value?.dirty) throw new Error("This chapter could not be saved.");
}

function selectChapter(id: string) {
  currentId.value = id;
  void router.replace({ query: { ...route.query, chapter: id } });
}

const { mutateAsync: createChapter, isPending: creating } = useCreateChapter();
async function addChapter() {
  try {
    await saveCurrent();
    const created = await createChapter({
      documentId: doc.id,
      content: { type: "doc", content: [{ type: "heading", attrs: { level: 1 } }] },
    });
    selectChapter(created.id);
  } catch (e: unknown) {
    toast.error(e instanceof Error ? e.message : "Could not add a chapter.");
  }
}

// ── What the preview and the export lay out ────────────────────────────────
const live = ref<LiveChapter | null>(null);
const liveVersion = ref(0);
const showExport = ref(false);
const html = useBookChapterHtml({
  documentId: docId,
  kind: computed(() => settings.draft.kind),
  theme: themeRef,
  live,
  liveVersion,
  // The layout runs whenever the book is open, so every body is always wanted.
  enabled: ref(true),
});

function onEdit(json: JSONContent) {
  live.value = { id: currentId.value, json };
  liveVersion.value++;
}

const layout = ref<BookLayoutResult | null>(null);
/** Where the open chapter's pages and columns start in the layout: the editor draws them (#1175). Null until the open chapter's first layout lands. */
const flow = ref<ChapterFlow | null>(null);
/** How far the rest of the book's first layout has got, for the chapter list's quiet footer. */
const layoutProgress = ref<{ done: number; total: number } | null>(null);
/** Until the whole book has been laid out once, its later chapters have no page numbers yet. Null when they all do. */
const numbering = computed(() => {
  if (layout.value !== null) return null;
  return { done: layoutProgress.value?.done ?? 0, total: layoutProgress.value?.total ?? null };
});
const pageRanges = computed(() => {
  const out: Record<string, { first: string | null; last: string | null }> = {};
  for (const span of layout.value?.chapters ?? []) out[span.id] = { first: span.firstLabel, last: span.lastLabel };
  return out;
});
const pagesLabel = computed(() => {
  const range = pageRanges.value[currentId.value];
  if (!range?.first) return null;
  return range.first === range.last || !range.last ? `Page ${range.first}` : `Pages ${range.first} to ${range.last}`;
});

/** What the panel says about the open chapter's page: the paper, where the chapter sits, the book's page numbers. */
const pageContext = computed<PanelPageContext>(() => {
  const index = chapterList.value.findIndex((c) => c.id === currentId.value);
  return {
    paperLabel: paperLine(scriptoriumLook(settings.draft.theme).label, settings.draft.pageSize, settings.draft.isTwoColumn),
    chapterNumber: index + 1,
    chapterTitle: chapterList.value[index]?.title ?? "",
    isHandout: isHandout.value,
    firstPageLabel: pageRanges.value[currentId.value]?.first ?? null,
    bookPageCount: layout.value?.pageCount ?? null,
  };
});

// ── Save status ─────────────────────────────────────────────────────────────
const chapterStatus = ref<{ status: AutosaveStatus; error: string }>({ status: "saved", error: "" });
function onChapterStatus(state: { status: AutosaveStatus; error: string }) {
  chapterStatus.value = state;
}
const RANK: Record<AutosaveStatus, number> = { error: 4, paused: 3, saving: 2, dirty: 1, saved: 0 };
const status = computed<AutosaveStatus>(() => {
  const own = settings.status.value;
  return RANK[own] > RANK[chapterStatus.value.status] ? own : chapterStatus.value.status;
});
const statusError = computed(() => (chapterStatus.value.status === "error" ? chapterStatus.value.error : settings.saveError.value));

// ── Leaving: save first, ask only if the save failed ───────────────────────
onBeforeRouteLeave(async () => {
  try {
    await saveCurrent();
    await settings.saveNow();
  } catch {
    /* the guard below asks */
  }
});
useUnsavedGuard({
  isDirty: () => !!chapterEditor.value?.dirty || settings.dirty.value,
  survives: (to) => to.name === route.name && to.params.id === route.params.id,
  ask: () => confirm("Your latest changes could not be saved. Leave anyway?", { confirmLabel: "Leave" }),
});

// ── AI provenance: the first edit of an AI-drafted book flips it ───────────
const { mutateAsync: updateDoc } = useUpdateScriptoriumDocument();
let provenanceFlipped = false;
function onUserEdit() {
  const provenance = doc.ai_provenance;
  if (provenanceFlipped || !provenance || provenance.edited) return;
  provenanceFlipped = true;
  void updateDoc({ id: doc.id, update: { ai_provenance: markEdited(provenance) } });
}

// ── Read as spreads' notes: a block in any chapter opens that chapter and focuses it ─
const pendingFocus = ref<string | null>(null);
async function editBlock(target: { chapterId: string; blockId: string | null }) {
  reading.value = false;
  pendingFocus.value = target.blockId;
  if (target.chapterId !== currentId.value) {
    try {
      await saveCurrent();
    } catch {
      pendingFocus.value = null;
      return;
    }
    selectChapter(target.chapterId);
  } else {
    focusPending();
  }
}
function focusPending() {
  if (pendingFocus.value && chapterEditor.value?.focusBlock(pendingFocus.value)) pendingFocus.value = null;
}
function onEditorReady() {
  // The ref is set after the editor's own onCreate, so wait a tick.
  void Promise.resolve().then(focusPending);
}

// ── Page furniture ──────────────────────────────────────────────────────────
const selectedFurnitureId = ref<string | null>(null);
function furnitureAnchor(): FurnitureAnchor {
  const blockId = chapterEditor.value?.blockIdAtCursor();
  return blockId ? { type: "block", blockId } : { type: "page", chapterId: currentId.value, page: 1 };
}
function addFurniture(kind: FurnitureKind) {
  const item = createFurnitureItem(kind, furnitureAnchor());
  settings.patch({ furniture: [...settings.draft.furniture, item] });
  selectedFurnitureId.value = item.id;
}

// ── Campaign scope ──────────────────────────────────────────────────────────
const { activeCampaignId } = storeToRefs(useCampaignStore());
const { data: dmCampaigns } = useAllDmCampaigns();
function campaignName(id: string): string {
  return dmCampaigns.value?.find((c) => c.id === id)?.name ?? "Unknown campaign";
}
const campaignOptions = computed(() => {
  const options: Array<{ value: string | null; label: string }> = [];
  if (activeCampaignId.value) options.push({ value: activeCampaignId.value, label: campaignName(activeCampaignId.value) });
  const own = settings.draft.campaignId;
  if (own && own !== activeCampaignId.value) options.push({ value: own, label: campaignName(own) });
  options.push({ value: null, label: "All my campaigns" });
  return options;
});
async function moveToActiveCampaign() {
  if (!activeCampaignId.value) return;
  settings.patch({ campaignId: activeCampaignId.value });
  await settings.saveNow();
}

// ── Giving / sharing: the stored body is what is shared, so save first ─────
const showShare = ref(false);
const canGive = computed(() => !!doc.campaign_id && doc.campaign_id === activeCampaignId.value);
const giveHint = computed(() =>
  doc.campaign_id ? "Switch to this book's campaign to share it." : "Move this book into a campaign (in Book settings) to share it.",
);
async function prepareToGive(): Promise<boolean> {
  try {
    await saveCurrent();
    await settings.saveNow();
    return !settings.dirty.value;
  } catch {
    toast.error("Save your changes before sharing.");
    return false;
  }
}
async function openShare() {
  if (await prepareToGive()) showShare.value = true;
}

// ── Export ──────────────────────────────────────────────────────────────────
const { isExporting, exportError, progress: pdfProgress, exportPdf, printCheck } = useScriptoriumPdf();

/**
 * "Show me" on a page the print check named: open its chapter and bring the
 * page into view. A chapter just opened has no page gaps until its layout
 * lands, so this waits for them, a few seconds at most.
 */
async function showPrintedPage(target: { chapterId: string; page: number }) {
  reading.value = false;
  if (target.chapterId !== currentId.value) {
    try {
      await saveCurrent();
    } catch {
      return;
    }
    selectChapter(target.chapterId);
  }
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    if (chapterEditor.value?.scrollToPage(target.page)) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
}
function openExport() {
  showExport.value = true;
}
async function runExport(bundle?: GrimoireBundle): Promise<boolean> {
  try {
    await saveCurrent();
  } catch {
    toast.error("Save your changes before exporting.");
    return false;
  }
  const ok = await exportPdf({
    chapters: html.chapters(),
    title: settings.draft.title,
    theme: settings.draft.theme,
    pageSize: settings.draft.pageSize,
    inkFriendly: settings.draft.inkFriendly,
    isTwoColumn: settings.draft.isTwoColumn,
    showPageNumbers: settings.draft.showPageNumbers,
    footerText: settings.draft.footerText,
    footerTitle: settings.draft.footerTitle,
    pageNumberStart: settings.draft.pageNumberStart,
    furniture: settings.draft.furniture,
    bundle,
  });
  if (ok) toast.success("Your PDF is ready.");
  else if (exportError.value) toast.error(exportError.value);
  return ok;
}

// ── Settings panel and delete ───────────────────────────────────────────────
const showSettings = ref(false);
const deleting = ref(false);
const { mutateAsync: deleteDoc } = useDeleteScriptoriumDocument();
async function destroy() {
  const question = isHandout.value
    ? `Delete "${doc.title}"? This cannot be undone.`
    : `Delete "${doc.title}"? This deletes every chapter and cannot be undone.`;
  if (!(await confirm(question))) return;
  deleting.value = true;
  await Promise.all([settings.hold(), chapterEditor.value?.hold()]);
  try {
    // Every chapter's images go with the book, so read every body first.
    const bodies = await html.fullQuery.refetch({ throwOnError: true });
    await deleteDoc(doc.id);
    for (const row of bodies.data ?? []) removeRichTextImages(JSON.stringify(row.content));
    router.replace("/scriptorium");
  } catch (e: unknown) {
    settings.release();
    chapterEditor.value?.release();
    deleting.value = false;
    toast.error(e instanceof Error ? e.message : isHandout.value ? "Could not delete the handout." : "Could not delete the book.");
  }
}
</script>
