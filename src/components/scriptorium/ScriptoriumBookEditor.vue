<template>
  <div class="flex h-dvh min-h-0 flex-col bg-background" data-testid="book-editor">
    <ScriptoriumBookHeader
      v-model:mode="mode"
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

    <div v-if="settings.draft.kind === 'handout'" class="shrink-0 border-b border-border px-4 py-2 sm:px-6">
      <HandoutAudienceLine :handout="doc" />
    </div>

    <div class="flex min-h-0 flex-1">
      <div
        v-if="chapterList.length > 1"
        class="hidden shrink-0 border-r border-border md:block"
        :class="mode === 'write' ? 'w-68' : 'w-56'"
      >
        <ChapterRail
          :document-id="doc.id"
          :chapters="chapterList"
          :current-id="currentId"
          :page-ranges="pageRanges"
          :before-leave="saveCurrent"
          @select="selectChapter"
        />
      </div>

      <div class="flex min-h-0 min-w-0 flex-1" :class="{ hidden: mode === 'inspect' }">
        <div v-if="chapterList.length === 0 && !listLoading" class="m-auto">
          <EmptyState title="This book has no chapters" description="Add one to start writing.">
            <template #action>
              <AppButton variant="primary" size="md" :icon="IconAdd" label="Add chapter" @click="addChapter" />
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
          :is-two-column="settings.draft.isTwoColumn"
          :ink-friendly="settings.draft.inkFriendly"
          :pages-label="pagesLabel"
          @edit="onEdit"
          @user-edit="onUserEdit"
          @status="onChapterStatus"
          @ready="onEditorReady"
          @add-furniture="addFurniture"
        >
          <template #footer>
            <AppButton
              v-if="chapterList.length <= 1"
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

      <div v-show="mode !== 'write'" class="flex min-h-0 min-w-0 flex-1 border-l border-border" :class="{ 'border-l-0': mode === 'inspect' }">
        <ScriptoriumPreviewPane
          ref="previewPane"
          v-model:notes-open="notesOpen"
          :document-id="doc.id"
          :title="settings.draft.title"
          :chapters="html.chapters"
          :changes="html.version.value"
          :settings="layoutSettings"
          :chapter-summaries="chapterList"
          :active="mode !== 'write'"
          :mode="mode === 'inspect' ? 'inspect' : 'split'"
          :focus-chapter-id="currentId"
          :furniture="settings.draft.furniture"
          :selected-furniture-id="selectedFurnitureId"
          :for-players="settings.draft.kind === 'handout'"
          @edit-block="editBlock"
          @update:furniture="settings.patch({ furniture: $event })"
          @update:selected-furniture-id="selectedFurnitureId = $event"
          @layout="layout = $event"
          @close="mode = lastMode"
        >
          <template #layer="{ host }">
            <InspectNotesLayer
              v-if="mode === 'inspect' && host && layout"
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
      </div>
    </div>

  <FurnitureInspector
    :item="selectedFurniture"
    @update="updateFurniture"
    @delete="deleteFurniture"
    @close="selectedFurnitureId = null"
  />

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
    @close="showExport = false"
  />

  <HandoutShareDialog :open="showShare" :handout="doc" @close="showShare = false" />
  </div>
</template>

<script setup lang="ts">
/**
 * The editor for a book of chapters (#1115 story 13): the shell that holds one
 * chapter in the editor, the chapter list beside it, the preview, and the book's
 * settings, and wires them together. Writing a chapter is ScriptoriumChapterEditor,
 * the pages are ScriptoriumPreviewPane, the book-wide options are
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
import ChapterRail from "@/components/scriptorium/chapters/ChapterRail.vue";
import InspectNotesDrawer from "@/components/scriptorium/inspect/InspectNotesDrawer.vue";
import InspectNotesLayer from "@/components/scriptorium/inspect/InspectNotesLayer.vue";
import FurnitureInspector from "@/components/scriptorium/FurnitureInspector.vue";
import HandoutAudienceLine from "@/components/scriptorium/HandoutAudienceLine.vue";
import HandoutShareControl from "@/components/scriptorium/HandoutShareControl.vue";
import HandoutShareDialog from "@/components/scriptorium/HandoutShareDialog.vue";
import ScriptoriumBookHeader, { type EditorMode } from "@/components/scriptorium/ScriptoriumBookHeader.vue";
import ScriptoriumBookSettings from "@/components/scriptorium/ScriptoriumBookSettings.vue";
import ScriptoriumChapterEditor from "@/components/scriptorium/ScriptoriumChapterEditor.vue";
import ScriptoriumExportDialog from "@/components/scriptorium/ScriptoriumExportDialog.vue";
import ScriptoriumPreviewPane from "@/components/scriptorium/ScriptoriumPreviewPane.vue";
import { markEdited } from "@/ai/provenance";
import { useAllDmCampaigns } from "@/composables/campaign/useCampaigns";
import type { GrimoireBundle } from "@/composables/campaign/useWorldBundle";
import { useBookChapterHtml, type LiveChapter } from "@/composables/scriptorium/useBookChapterHtml";
import { useBookSettings } from "@/composables/scriptorium/useBookSettings";
import { useUpdateScriptoriumDocument, useDeleteScriptoriumDocument } from "@/composables/scriptorium/useScriptorium";
import {
  useBookChapterList,
  useCreateChapter,
  useScriptoriumChapter,
} from "@/composables/scriptorium/useScriptoriumChapters";
import { useScriptoriumPdf } from "@/composables/scriptorium/useScriptoriumPdf";
import { removeRichTextImages } from "@/composables/useImageUpload";
import { useConfirm } from "@/composables/useConfirm";
import { useToast } from "@/composables/useToast";
import { useUnsavedGuard } from "@/composables/useUnsavedGuard";
import type { AutosaveStatus } from "@/composables/useAutosave";
import { IconAdd } from "@/lib/icons";
import { bundlePreselection } from "@/lib/scriptorium/bundlePreselection";
import { createFurnitureItem } from "@/lib/scriptorium/furniture/model";
import { SCRIPTORIUM_THEME_KEY } from "@/lib/scriptorium/scriptoriumTheme";
import type { BookLayoutResult, BookLayoutSettings } from "@/lib/scriptorium/bookLayout/types";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";
import { useScriptoriumUiStore } from "@/stores/ui/scriptorium";
import type { JSONContent } from "@tiptap/core";
import type { FurnitureAnchor, FurnitureKind, PageFurnitureItem, ScriptoriumDocument } from "@/types/scriptorium.types";

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
const themeRef = computed(() => settings.draft.theme);
provide(SCRIPTORIUM_THEME_KEY, themeRef);

const layoutSettings = computed<BookLayoutSettings>(() => ({
  pageSize: settings.draft.pageSize,
  isTwoColumn: settings.draft.isTwoColumn,
  showPageNumbers: settings.draft.showPageNumbers,
  pageNumberStart: settings.draft.pageNumberStart,
  footerText: settings.draft.footerText,
  inkFriendly: settings.draft.inkFriendly,
  theme: settings.draft.theme,
}));

// ── Mode: Write | Split | Inspect ───────────────────────────────────────────
const { scriptoriumEditorMode } = storeToRefs(useScriptoriumUiStore());
const inspecting = ref(false);
const lastMode = computed<EditorMode>(() => scriptoriumEditorMode.value);
const mode = computed<EditorMode>({
  get: () => (inspecting.value ? "inspect" : scriptoriumEditorMode.value),
  set: (value) => {
    inspecting.value = value === "inspect";
    if (value !== "inspect") scriptoriumEditorMode.value = value;
  },
});
const notesOpen = ref(true);

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
const previewWanted = computed(() => mode.value !== "write" || showExport.value);
const html = useBookChapterHtml({
  documentId: docId,
  kind: computed(() => settings.draft.kind),
  theme: themeRef,
  live,
  liveVersion,
  enabled: previewWanted,
});

function onEdit(json: JSONContent) {
  live.value = { id: currentId.value, json };
  liveVersion.value++;
}

const layout = ref<BookLayoutResult | null>(null);
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

// ── Click-to-edit: a block in any chapter opens that chapter and focuses it ─
const pendingFocus = ref<string | null>(null);
async function editBlock(target: { chapterId: string; blockId: string | null }) {
  if (inspecting.value) inspecting.value = false;
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
const selectedFurniture = computed(
  () => settings.draft.furniture.find((f) => f.id === selectedFurnitureId.value) ?? null,
);
function furnitureAnchor(): FurnitureAnchor {
  const blockId = chapterEditor.value?.blockIdAtCursor();
  return blockId ? { type: "block", blockId } : { type: "page", chapterId: currentId.value, page: 1 };
}
function addFurniture(kind: FurnitureKind) {
  const item = createFurnitureItem(kind, furnitureAnchor());
  settings.patch({ furniture: [...settings.draft.furniture, item] });
  selectedFurnitureId.value = item.id;
}
function updateFurniture(updated: PageFurnitureItem) {
  settings.patch({ furniture: settings.draft.furniture.map((f) => (f.id === updated.id ? updated : f)) });
}
function deleteFurniture(id: string) {
  settings.patch({ furniture: settings.draft.furniture.filter((f) => f.id !== id) });
  if (selectedFurnitureId.value === id) selectedFurnitureId.value = null;
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
const { isExporting, exportError, progress: pdfProgress, exportPdf } = useScriptoriumPdf();
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
  if (!(await confirm(`Delete "${doc.title}"? This deletes every chapter and cannot be undone.`))) return;
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
    toast.error(e instanceof Error ? e.message : "Could not delete the book.");
  }
}
</script>
