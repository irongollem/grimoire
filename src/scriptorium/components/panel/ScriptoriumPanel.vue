<template>
  <div class="flex h-full w-80 flex-col overflow-y-auto bg-card" data-testid="scriptorium-panel" :data-selection="selection.kind">
    <div v-if="closable" class="flex shrink-0 justify-end border-b border-border px-2 py-1">
      <AppButton variant="ghost" size="icon-xs" :icon="IconClose" aria-label="Close the panel" @click="emit('close')" />
    </div>

    <ArtPickerModal :show="picker !== null" @select="onArtPicked" @close="picker = null" />

    <!-- Only mounted while it is open: it reads the campaign's characters, which a closed panel has no use for. -->
    <ChroniclerGenerateDialog
      v-if="describing"
      visible
      title="Describe the picture"
      :shapes="describeSceneShapes"
      close-on-start
      @close="describing = null"
      @started="onDescribeStarted"
    />

    <PicturePanelSection
      v-if="picture"
      :src="picture.src"
      :layer="picture.layer"
      :where="picture.where"
      :node-attrs="picture.nodeAttrs"
      :item="picture.item"
      :anchor="picture.anchor"
      :can-edit="canEditPicture"
      :edit-hint="editHint"
      :can-describe="canDescribe"
      @layer="onLayer"
      @node-attrs="onNodeAttrs"
      @item="onItem"
      @corner="(v) => onCorner(picture?.item ?? null, v)"
      @stays="(v) => onStays(picture?.item ?? null, v)"
      @pick="picker = { mode: 'replace' }"
      @describe="describing = picture?.target ?? null"
      @replace="(src) => picture && pictures.replaceSrc(picture.target, src)"
      @edit="emit('editPicture', $event)"
      @remove="picture && pictures.remove(picture.target)"
    />

    <DecorationPanelSection
      v-else-if="decoration"
      :item="decoration.item"
      :anchor="decoration.anchor"
      @patch="onItem"
      @corner="(v) => onCorner(decoration?.item ?? null, v)"
      @stays="(v) => onStays(decoration?.item ?? null, v)"
      @remove="decoration && pictures.remove({ source: 'furniture', id: decoration.item.id })"
    />

    <CoverPanelSection v-else-if="node && selection.kind === 'cover'" :attrs="node.attrs" @update="onNodeEdit" />

    <EmbedPanelSection
      v-else-if="node && selection.kind === 'embed'"
      :attrs="node.attrs"
      @update="onNodeEdit"
      @open="onEmbedSignal(EMBED_OPEN_EVENT)"
      @detach="onEmbedSignal(EMBED_DETACH_EVENT)"
    />

    <DividerPanelSection v-else-if="node && selection.kind === 'divider'" :variant="node.attrs.variant" @update="onNodeEdit" />

    <ContentsPanelSection v-else-if="selection.kind === 'contents'" />

    <BlockPanelSection
      v-else-if="block"
      :name="block.name"
      :look-label="block.lookLabel"
      :family="block.family"
      :keep="block.keep"
      :across="block.across"
      :can-span="block.canSpan"
      :rows="block.rows"
      @keep="(v) => onNodeEdit({ keepTogether: v })"
      @across="onAcross"
      @rows="(v) => onNodeEdit({ class: withTableRows(node?.attrs.class, v) })"
      @open-settings="emit('openSettings')"
    />

    <FooterPanelSection
      v-else-if="selection.kind === 'footer'"
      :page-label="footerPageLabel(selection.page)"
      :settings="footerSettings().draft"
      :markers="footerMarkers"
      @settings="(values) => footerSettings().patch(values)"
      @markers="onFooterMarkers"
    />

    <PagePanelSection
      v-else
      :description="description"
      :paper-label="context.paperLabel"
      :entries="entries"
      @open-settings="emit('openSettings')"
      @select="onEntry"
      @add-picture="picker = { mode: 'add' }"
      @add-furniture="(kind) => emit('addFurniture', kind)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The panel beside the page (#1176, Scriptorium One Surface): always about the
 * current selection, or the page when nothing is selected. It chooses the
 * section and turns each section's events into edits; the sections only draw.
 * Edits go to the node the selection names, by position, so a field touched
 * after the cursor moved still changes the thing the panel is showing.
 */
import { computed, inject, ref, toRaw } from "vue";
import type { Editor } from "@tiptap/core";
import AppButton from "@/components/common/controls/AppButton.vue";
import ArtPickerModal from "@/components/common/overlays/ArtPickerModal.vue";
import BlockPanelSection from "@/scriptorium/components/panel/BlockPanelSection.vue";
import ContentsPanelSection from "@/scriptorium/components/panel/ContentsPanelSection.vue";
import CoverPanelSection from "@/scriptorium/components/panel/CoverPanelSection.vue";
import DecorationPanelSection from "@/scriptorium/components/panel/DecorationPanelSection.vue";
import DividerPanelSection from "@/scriptorium/components/panel/DividerPanelSection.vue";
import EmbedPanelSection from "@/scriptorium/components/panel/EmbedPanelSection.vue";
import FooterPanelSection from "@/scriptorium/components/panel/FooterPanelSection.vue";
import ChroniclerGenerateDialog from "@/components/notes/ChroniclerGenerateDialog.vue";
import PagePanelSection from "@/scriptorium/components/panel/PagePanelSection.vue";
import PicturePanelSection, { type PictureLayer } from "@/scriptorium/components/panel/PicturePanelSection.vue";
import { FOOTER_SETTINGS_KEY, type FooterSettingsAccess } from "@/scriptorium/lib/footerTitle";
import { NO_MARKERS, pageMarkerTransaction, readPageMarkers, type PageMarkers } from "@/scriptorium/lib/pageMarkers";
import type { AnchorState, PictureActions, PictureTarget } from "@/scriptorium/composables/useEditorPictures";
import type { PanelSelection } from "@/scriptorium/composables/useScriptoriumSelection";
import { blockPositions } from "@/scriptorium/lib/furniture/editorAnchors";
import { EMBED_DETACH_EVENT, EMBED_OPEN_EVENT, signalEmbed } from "@/scriptorium/lib/panel/embedSignals";
import { setAcross, wideAround } from "@/scriptorium/lib/panel/blockSpan";
import { updateNodeAttrs } from "@/scriptorium/lib/panel/nodeAttrs";
import { isTwoColumnPage } from "@/scriptorium/lib/kit/twoColumn";
import { scriptoriumLook } from "@/scriptorium/lib/looks";
import { SCRIPTORIUM_THEME_KEY } from "@/scriptorium/lib/scriptoriumTheme";
import { onThisPage, type PageEntry } from "@/scriptorium/lib/panel/onThisPage";
import { bookPageNumber, describePage, type PanelPageContext } from "@/scriptorium/lib/panel/pageInfo";
import type { PageBox, PageFlowStorage } from "@/scriptorium/tiptap/pageFlow";
import type { FurnitureKind, PageFurnitureItem } from "@/scriptorium/types";
import type { WorkbenchTool } from "@/scriptorium/illuminator/useIlluminateWorkbench";
import { IconClose } from "@/lib/icons";
import { tableRowsOf, withTableRows } from "@/scriptorium/lib/tableRows";
import { describeShapes } from "@/scriptorium/lib/describeShapes";
import { useCampaignStore } from "@/stores/campaign";

const props = defineProps<{
  selection: PanelSelection;
  editor: Editor | undefined;
  /** Bumped on every editor transaction: the editor is not reactive, this is how attrs are re-read. */
  version: number;
  chapterId: string;
  furniture: PageFurnitureItem[];
  pictures: PictureActions;
  context: PanelPageContext;
  /** The selected picture (in the text or on the page) is one the Illuminator can open. */
  canEditPicture: boolean;
  /** A slide-over has a close button of its own. */
  closable: boolean;
  /** The book's campaign: Describe it is offered only for the active one with AI on. */
  campaignId?: string | null;
  /** The page's width over its height: the Full page shape is cut to it. */
  pageAspect?: number;
}>();

const emit = defineEmits<{
  close: [];
  openSettings: [];
  addFurniture: [kind: FurnitureKind];
  updateItem: [item: PageFurnitureItem];
  selectFurniture: [id: string | null];
  /** Open the Illuminator on the picture, on the Crop tool when asked. */
  editPicture: [tool?: WorkbenchTool];
  /** A picture was described: its render is queued and the editor waits for it. */
  describe: [target: PictureTarget, job: { jobId: string; shape: string }];
}>();

// A reactive wrapper around the editor would hand ProseMirror proxies of its own state, and a
// transaction built from one is refused as mismatched: edits always go to the editor itself.
const rawEditor = computed(() => (props.editor ? toRaw(props.editor) : undefined));

const picker = ref<{ mode: "add" | "replace" } | null>(null);

// ── Describe it ─────────────────────────────────────────────────────────────
const campaign = useCampaignStore();
/** AI is per campaign, so a book of another campaign, or one with AI off, has no Describe it. */
const canDescribe = computed(() => !!props.campaignId && props.campaignId === campaign.activeCampaignId && campaign.isAiEnabled);
/** The picture being described: kept from the click, so what the dialog paints lands where the DM asked. */
const describing = ref<PictureTarget | null>(null);
const A4_ASPECT = 1 / 1.414;
const describeSceneShapes = computed(() =>
  describeShapes(props.pageAspect ?? A4_ASPECT).map((s) => ({ id: s.id, label: s.label, size: s.aiSize })),
);
function onDescribeStarted(job: { jobId: string; shape: string }) {
  const target = describing.value;
  if (target) emit("describe", target, { jobId: job.jobId, shape: job.shape });
}

function pagesOf(ed: Editor): PageBox[] {
  return (ed.storage as unknown as { pageFlow?: PageFlowStorage }).pageFlow?.pages ?? [];
}

/** The selected node, re-read on every transaction. */
const node = computed(() => {
  void props.version;
  const ed = rawEditor.value;
  const sel = props.selection;
  if (!ed || ed.isDestroyed || !("pos" in sel)) return null;
  return ed.state.doc.nodeAt(sel.pos);
});

const selectedItem = computed(() => {
  const sel = props.selection;
  return "id" in sel ? (props.furniture.find((f) => f.id === sel.id) ?? null) : null;
});

const picture = computed(() => {
  const sel = props.selection;
  if (sel.kind !== "picture") return null;
  if (sel.source === "node") {
    const n = node.value;
    if (!n || n.type.name !== "image") return null;
    const src: unknown = n.attrs.src;
    return {
      target: { source: "node", pos: sel.pos } as PictureTarget,
      src: typeof src === "string" ? src : null,
      layer: "text" as PictureLayer,
      where: "In the text",
      nodeAttrs: n.attrs as Record<string, unknown>,
      item: null,
      anchor: null,
    };
  }
  const item = selectedItem.value;
  if (!item) return null;
  const src = item.props.src;
  const page = props.pictures.pageOf(item);
  const inBook = page === null ? null : bookPageNumber(props.context.firstPageLabel, page);
  return {
    target: { source: "furniture", id: item.id } as PictureTarget,
    src: typeof src === "string" && src !== "" ? src : null,
    layer: item.z as PictureLayer,
    where: page === null ? "Placed on a page" : `Placed on page ${inBook ?? page}`,
    nodeAttrs: null,
    item,
    anchor: anchorFor(item),
  };
});

const decoration = computed(() => {
  if (props.selection.kind !== "decoration" || !selectedItem.value) return null;
  return { item: selectedItem.value, anchor: anchorFor(selectedItem.value) };
});

function anchorFor(item: PageFurnitureItem): AnchorState {
  void props.version;
  return props.pictures.anchorState(item);
}

const editHint = "Only pictures stored in Grimoire can be edited";

function onLayer(value: PictureLayer) {
  const target = picture.value?.target;
  if (!target || value === picture.value?.layer) return;
  if (target.source === "node") {
    if (value !== "text") props.pictures.placeOnPage(target.pos, value);
    return;
  }
  if (value === "text") {
    props.pictures.putInText(target.id);
    return;
  }
  const item = picture.value?.item;
  if (item) emit("updateItem", { ...item, z: value });
}

// ── A box or table ──────────────────────────────────────────────────────────
const BLOCK_NAMES: Record<string, string> = {
  descriptiveBlock: "Read-aloud",
  noteBlock: "Sidebar",
  quoteBlock: "Quote",
  wideBlock: "Wide block",
  blockquote: "Callout",
  table: "Table",
};
const theme = inject(SCRIPTORIUM_THEME_KEY, null);
const block = computed(() => {
  const ed = rawEditor.value;
  const n = node.value;
  const sel = props.selection;
  if (!ed || ed.isDestroyed || sel.kind !== "block" || !n) return null;
  const look = theme ? scriptoriumLook(theme.value) : null;
  const wide = n.type.name === "wideBlock";
  return {
    name: BLOCK_NAMES[n.type.name] ?? "Block",
    lookLabel: look?.label ?? null,
    family: look?.family ?? null,
    keep: n.attrs.keepTogether === true,
    across: wideAround(ed.state.doc, sel.pos) !== null,
    // The wide block always has its switch (it is the thing that spans); the rest only in two columns.
    canSpan: wide || isTwoColumnPage(ed),
    rows: n.type.name === "table" ? tableRowsOf(n.attrs.class) : null,
  };
});

function onAcross(value: boolean) {
  const sel = props.selection;
  if (rawEditor.value && sel.kind === "block") setAcross(rawEditor.value, sel.pos, value);
}

/** Writes to the node the selection names; the cover and the entry are edited this way. */
function onNodeEdit(patch: Record<string, unknown>) {
  const sel = props.selection;
  if (rawEditor.value && "pos" in sel) updateNodeAttrs(rawEditor.value, sel.pos, patch);
}
const onNodeAttrs = onNodeEdit;

function onEmbedSignal(event: typeof EMBED_OPEN_EVENT | typeof EMBED_DETACH_EVENT) {
  const sel = props.selection;
  if (rawEditor.value && sel.kind === "embed") signalEmbed(rawEditor.value, sel.pos, event);
}

function onCorner(item: PageFurnitureItem | null, value: string | undefined) {
  if (item) props.pictures.chooseCorner(item, value);
}
function onStays(item: PageFurnitureItem | null, value: string | undefined) {
  if (item) props.pictures.chooseAnchor(item, value);
}

function onItem(patch: Partial<PageFurnitureItem>) {
  const item = selectedItem.value;
  if (item) emit("updateItem", { ...item, ...patch });
}

function onArtPicked(url: string) {
  const mode = picker.value?.mode;
  picker.value = null;
  if (mode === "add") props.pictures.addArt(url);
  else if (mode === "replace" && picture.value) props.pictures.replaceSrc(picture.value.target, url);
}

// ── A footer ────────────────────────────────────────────────────────────────
// The book's own footer settings, provided by the book editor.
const footerAccess = inject(FOOTER_SETTINGS_KEY, null);
function footerSettings(): FooterSettingsAccess {
  if (!footerAccess) throw new Error("The book editor must provide FOOTER_SETTINGS_KEY for a selected footer.");
  return footerAccess;
}

function footerPageLabel(page: number): string {
  return String(bookPageNumber(props.context.firstPageLabel, page) ?? page);
}

/** What the selected footer's page carries, re-read on every transaction. */
const footerMarkers = computed<PageMarkers>(() => {
  void props.version;
  const ed = rawEditor.value;
  const sel = props.selection;
  if (!ed || ed.isDestroyed || sel.kind !== "footer") return NO_MARKERS;
  return readPageMarkers(ed.state.doc, pagesOf(ed), sel.page);
});

function onFooterMarkers(next: PageMarkers) {
  const ed = rawEditor.value;
  const sel = props.selection;
  if (!ed || ed.isDestroyed || sel.kind !== "footer") return;
  const tr = pageMarkerTransaction(ed.state, pagesOf(ed), sel.page, next);
  if (tr) ed.view.dispatch(tr);
}

// ── The page ────────────────────────────────────────────────────────────────
const pageNumber = computed(() => (props.selection.kind === "page" ? props.selection.page : null) ?? 1);

const description = computed(() => {
  void props.version;
  const ed = rawEditor.value;
  const pageCount = ed && !ed.isDestroyed ? Math.max(1, pagesOf(ed).length) : 1;
  return describePage(props.context, pageNumber.value, pageCount);
});

const entries = computed<PageEntry[]>(() => {
  void props.version;
  const ed = rawEditor.value;
  if (!ed || ed.isDestroyed) return [];
  const blocks = blockPositions(ed);
  return onThisPage({
    doc: ed.state.doc,
    pages: pagesOf(ed),
    page: pageNumber.value,
    chapterId: props.chapterId,
    furniture: props.furniture,
    blockPos: (id) => blocks.get(id) ?? null,
  });
});

function onEntry(entry: PageEntry) {
  if (entry.kind === "picture" && entry.source === "node") {
    emit("selectFurniture", null);
    rawEditor.value?.chain().focus().setNodeSelection(entry.pos).run();
    return;
  }
  if ("id" in entry) emit("selectFurniture", entry.id);
}
</script>
