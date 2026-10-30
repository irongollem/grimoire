<template>
  <section
    :class="inspect ? 'scriptorium-inspect fixed inset-0 z-40 flex flex-col bg-background' : 'flex min-h-0 min-w-0 flex-1 flex-col bg-muted/40'"
    :style="inspect ? inspectChrome : undefined"
    :aria-label="inspect ? 'Inspect the book' : 'Preview'"
    data-testid="preview-pane"
  >
    <ScriptoriumInspectBar
      v-if="inspect"
      v-model:spread="spread"
      v-model:notes-open="notesOpen"
      :document-id="documentId"
      :title="title"
      :chapters="chapterSummaries"
      :result="result"
      @close="emit('close')"
    />

    <div v-else class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-b border-border bg-card px-3.5 py-2 text-caption text-muted-foreground">
      <span class="flex items-center gap-1.5" data-testid="preview-status">
        <span v-if="isRendering" aria-hidden="true" class="size-2 rounded-full bg-primary" />
        {{ statusText }}
      </span>
      <span class="flex-1" />
      <span>{{ lookText }}</span>
      <span v-if="result" class="tabular-nums">{{ result.pageCount }} pages</span>
      <div class="flex items-center overflow-hidden rounded border border-border">
        <AppButton
          variant="ghost"
          fill="muted"
          size="toolbar"
          :icon="IconZoomOut"
          icon-size="xs"
          :disabled="effectiveZoom <= 0.25"
          tooltip="Zoom out"
          @click="zoomOut"
        />
        <AppButton
          variant="ghost"
          fill="muted"
          size="toolbar"
          class="min-w-9.5 border-x border-border"
          :active="zoomMode === 'fit'"
          :label="zoomMode === 'fit' ? 'Fit' : zoomLabel"
          :tooltip="zoomMode === 'fit' ? 'Fit to width' : 'Click to fit to width'"
          @click="zoomFit"
        />
        <AppButton
          variant="ghost"
          fill="muted"
          size="toolbar"
          :icon="IconZoomIn"
          icon-size="xs"
          :disabled="effectiveZoom >= 2.0"
          tooltip="Zoom in"
          @click="zoomIn"
        />
      </div>
    </div>

    <div class="flex min-h-0 flex-1">
      <div
        ref="containerRef"
        class="preview-stage min-h-0 min-w-0 flex-1"
        :class="inspect ? 'flex items-center justify-center overflow-hidden' : 'overflow-auto'"
        style="touch-action: pan-x pan-y"
      >
        <!-- The display scale is a transform, never CSS `zoom`: `zoom` makes the
             browser lay the text out again at the scaled size, where a line can
             break a pixel differently and spill past the page bottom. The box
             around it takes the scaled size so the scroll area matches what is
             drawn. The scale is neutralised (1) while Paged.js renders: it
             measures the live DOM against the unscaled @page height. -->
        <div class="paged-scale-box" :class="inspect ? '' : 'mx-auto'" :style="scaleBoxStyle">
          <div ref="scaleRef" class="paged-scale" :style="{ transform: `scale(${displayScale})` }">
            <div
              ref="hostRef"
              class="sc-theme paged-book"
              :class="[
                scriptoriumThemeClass(settings.theme),
                { 'paged-book--spread': inspect, 'paged-book--lone': inspect && spread === 0 },
              ]"
              :style="{ '--spread-page-width': `${pageBox.w}px` }"
              :title="inspect ? undefined : 'Click any block to edit it'"
              @click="onPagedClick"
            />
          </div>
        </div>
        <p v-if="error" class="px-4 py-3 text-caption text-destructive" role="alert">{{ error }}</p>
        <slot name="layer" :host="hostEl" />
      </div>
      <div v-if="inspect && notesOpen" class="flex min-h-0 w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
        <slot name="drawer" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The book as it will print, laid out chapter by chapter by the book layout
 * engine (#1115 story 13). One host element, two ways to see it:
 *
 *  - Split: a column of pages beside the editor, scrolled to the chapter being
 *    written, with page furniture draggable on the pages.
 *  - Inspect: the same laid-out pages re-styled as one spread at a time, full
 *    screen. Nothing is laid out again to get there.
 *
 * The footers, the contents page and the furniture are written by the engine;
 * this component only decides what is on screen. In Write mode the pane is
 * mounted but `active` is false: no render is scheduled and nothing is laid out
 * until the preview is wanted again.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import ScriptoriumInspectBar from "@/components/scriptorium/ScriptoriumInspectBar.vue";
import { IconZoomIn, IconZoomOut } from "@/lib/icons";
import { scaledBoxSize, useScriptoriumZoom } from "@/composables/scriptorium/useScriptoriumZoom";
import { useBookPreview } from "@/composables/scriptorium/useBookPreview";
import { useFurnitureEditing } from "@/composables/scriptorium/useFurnitureEditing";
import { useHotkeys } from "@/composables/useHotkeys";
import { prefersReducedMotion } from "@/lib/motion";
import { buildPagedPreviewCss } from "@/lib/scriptorium/pagedPreviewCss";
import { renderFurniture, CHAPTER_ID_ATTR } from "@/lib/scriptorium/furniture/renderFurniture";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/lib/scriptorium/editorConstants";
import { scriptoriumLook, scriptoriumThemeClass } from "@/lib/scriptorium/looks";
import { activeThemeId, darkTwinStyle } from "@/lib/themeRuntime";
import { spreadCount, spreadPages } from "@/lib/scriptorium/spreads";
import type { BookChapterInput, BookLayoutResult, BookLayoutSettings } from "@/lib/scriptorium/bookLayout/types";
import type { PageFurnitureItem, ScriptoriumChapterSummary } from "@/types/scriptorium.types";

/** Inspect is lamplit (frame 04): the campaign theme's dark twin, whatever the viewer's light/dark setting. */
const inspectChrome = computed(() => darkTwinStyle(activeThemeId.value));
const {
  documentId,
  title,
  chapters,
  changes,
  settings,
  chapterSummaries,
  active,
  mode,
  focusChapterId = null,
  furniture = [],
  selectedFurnitureId = null,
  forPlayers = false,
} = defineProps<{
  documentId: string;
  title: string;
  /** Builds the chapters' HTML; called only when a render runs. */
  chapters: () => BookChapterInput[];
  /** Changes whenever `chapters` would return something different. */
  changes: number;
  settings: BookLayoutSettings;
  chapterSummaries: ScriptoriumChapterSummary[];
  /** False in Write mode: nothing is scheduled or laid out. */
  active: boolean;
  mode: "split" | "inspect";
  focusChapterId?: string | null;
  furniture?: PageFurnitureItem[];
  selectedFurnitureId?: string | null;
  /** A handout: the preview is what the players see. */
  forPlayers?: boolean;
}>();

const emit = defineEmits<{
  editBlock: [target: { chapterId: string; blockId: string }];
  "update:furniture": [items: PageFurnitureItem[]];
  "update:selectedFurnitureId": [id: string | null];
  layout: [result: BookLayoutResult | null];
  progress: [progress: { done: number; total: number } | null];
  close: [];
}>();

const inspect = computed(() => mode === "inspect");
const notesOpen = defineModel<boolean>("notesOpen", { default: false });
const spread = ref(0);

const containerRef = ref<HTMLElement | null>(null);
const hostRef = ref<HTMLElement | null>(null);
const hostEl = computed(() => hostRef.value);

const pageSizeRef = computed(() => settings.pageSize);
const pageBox = computed(() => EDITOR_PAGE_DIMENSIONS_PX[settings.pageSize]);
const { zoomMode, effectiveZoom, zoomLabel, zoomIn, zoomOut, zoomFit } = useScriptoriumZoom(pageSizeRef, containerRef);

const { isRendering, error, result, progress, scheduleRender } = useBookPreview({
  chapters: () => chapters(),
  changes: () => (active ? changes : "inactive"),
  settings: () => settings,
  stylesheets: () => [
    { "scriptorium-paged.css": buildPagedPreviewCss({ pageSize: settings.pageSize, inkFriendly: settings.inkFriendly }) },
  ],
  furniture: () => ({ items: furniture, options: { interactive: !inspect.value, selectedId: selectedFurnitureId } }),
  focusChapterId: () => focusChapterId,
  container: hostRef,
  afterRender: () => applySpread(),
});

watch(result, (value) => emit("layout", value));
watch(progress, (value) => emit("progress", value));

const lookText = computed(() => `${scriptoriumLook(settings.theme).label} · ${settings.pageSize}`);
const statusText = computed(() => {
  if (isRendering.value && progress.value) {
    return `Laying out chapter ${progress.value.done} of ${progress.value.total}…`;
  }
  if (isRendering.value) return "Laying out…";
  return forPlayers ? "As your players see it" : "Preview";
});

// ── Click to edit ───────────────────────────────────────────────────────────
function onPagedClick(e: MouseEvent) {
  if (inspect.value) return; // Inspect is for notes: a click there pins one
  const target = e.target as HTMLElement;
  const block = target.closest<HTMLElement>("[data-block-id]");
  const blockId = block?.dataset.blockId;
  const chapterId = target.closest<HTMLElement>(`.pagedjs_page[${CHAPTER_ID_ATTR}]`)?.getAttribute(CHAPTER_ID_ATTR);
  if (blockId && chapterId) emit("editBlock", { chapterId, blockId });
}

// ── Scale ───────────────────────────────────────────────────────────────────
const scaleRef = ref<HTMLElement | null>(null);
const contentSize = ref({ w: 0, h: 0 });
const stageSize = ref({ w: 0, h: 0 });
let observer: ResizeObserver | null = null;
onMounted(() => {
  observer = new ResizeObserver(() => {
    const el = scaleRef.value;
    if (el) contentSize.value = { w: el.offsetWidth, h: el.offsetHeight };
    const stage = containerRef.value;
    if (stage) stageSize.value = { w: stage.clientWidth, h: stage.clientHeight };
  });
  if (scaleRef.value) observer.observe(scaleRef.value);
  if (containerRef.value) observer.observe(containerRef.value);
  if (active) scheduleRender();
});
onBeforeUnmount(() => observer?.disconnect());

/** Inspect fits one whole spread in the stage; Split follows the zoom controls. */
const inspectScale = computed(() => {
  const gutter = 48;
  const byWidth = (stageSize.value.w - gutter) / (pageBox.value.w * 2);
  const byHeight = (stageSize.value.h - gutter) / pageBox.value.h;
  const fit = Math.min(byWidth, byHeight);
  return Number.isFinite(fit) && fit > 0 ? Math.min(fit, 1.5) : 1;
});
const displayScale = computed(() => {
  if (isRendering.value) return 1;
  return inspect.value ? inspectScale.value : effectiveZoom.value;
});
const scaleBoxStyle = computed(() => {
  const { width, height } = scaledBoxSize(contentSize.value, displayScale.value);
  return { width: `${width}px`, height: `${height}px` };
});
watch(() => settings.pageSize, () => zoomFit());

// ── Furniture (an overlay on the laid-out pages: re-drawn in place, never re-laid out) ──
watch(
  () => [furniture, selectedFurnitureId, inspect.value] as const,
  () => {
    if (hostRef.value) {
      renderFurniture(hostRef.value, furniture, { interactive: !inspect.value, selectedId: selectedFurnitureId });
    }
  },
  { deep: true },
);

useFurnitureEditing({
  container: hostRef,
  enabled: () => !inspect.value,
  items: () => furniture,
  onChange: (items) => emit("update:furniture", items),
  onSelect: (id) => emit("update:selectedFurnitureId", id),
});

// ── Follow the chapter being written (Split) ────────────────────────────────
const followed = shallowRef<string | null>(null);
function scrollToChapter(chapterId: string | null) {
  const stage = containerRef.value;
  const host = hostRef.value;
  if (!stage || !host || !chapterId || inspect.value) return;
  const page = host.querySelector<HTMLElement>(`.pagedjs_page[${CHAPTER_ID_ATTR}="${CSS.escape(chapterId)}"]`);
  if (!page) return;
  const offset = page.getBoundingClientRect().top - stage.getBoundingClientRect().top + stage.scrollTop;
  stage.scrollTo({ top: Math.max(0, offset - 12), behavior: prefersReducedMotion() ? "auto" : "smooth" });
  followed.value = chapterId;
}
// When the chapter changes, and once the first layout lands for it.
watch(
  () => [focusChapterId, result.value === null] as const,
  ([id, empty]) => {
    if (!empty && id !== followed.value) void nextTick(() => scrollToChapter(id));
  },
);
watch(() => active && mode === "split", (visible) => {
  if (visible) {
    followed.value = null;
    void nextTick(() => scrollToChapter(focusChapterId));
  }
});

// ── Spreads (Inspect) ───────────────────────────────────────────────────────
function applySpread() {
  const host = hostRef.value;
  if (!host) return;
  const pages = host.querySelectorAll<HTMLElement>(".pagedjs_page");
  if (!inspect.value) {
    pages.forEach((page) => page.style.removeProperty("display"));
    return;
  }
  const last = Math.max(0, spreadCount(pages.length) - 1);
  if (spread.value > last) spread.value = last;
  const shown = new Set(spreadPages(spread.value, pages.length));
  pages.forEach((page, index) => {
    if (shown.has(index)) page.style.removeProperty("display");
    else page.style.setProperty("display", "none");
  });
}
watch([spread, inspect], () => {
  applySpread();
  if (!inspect.value) void nextTick(() => scrollToChapter(focusChapterId));
});
watch(() => result.value, () => applySpread());

useHotkeys(
  [
    { combo: "arrowleft", description: "Previous spread", handler: () => (spread.value = Math.max(0, spread.value - 1)) },
    {
      combo: "arrowright",
      description: "Next spread",
      handler: () => (spread.value = Math.min(spreadCount(result.value?.pageCount ?? 0) - 1, spread.value + 1)),
    },
    { combo: "escape", description: "Close Inspect", handler: () => emit("close"), hidden: true },
  ],
  { layer: "overlay", enabled: () => inspect.value },
);

defineExpose({ host: hostRef, spread });
</script>

<style scoped>
@reference "@/assets/main.css";

/*
 * Layout-only styles. All theming (page look, typography, callouts, tables,
 * footers, ink-friendly, two-column) lives in the shared theme files at
 * src/assets/scriptorium/, consumed by this preview, the editor galley and the
 * PDF export. Do not re-add theme rules here.
 */
.preview-stage {
  padding: 1.25rem 1rem 3rem;
}
.scriptorium-inspect .preview-stage {
  padding: 1.5rem;
  background: var(--background);
}

.paged-scale-box {
  flex-shrink: 0;
}
.paged-scale {
  width: max-content;
  transform-origin: top left;
}

/* Click-to-edit affordance: hovering a block in the book hints it is editable. */
.paged-book :deep([data-block-id]) {
  cursor: pointer;
}
.paged-book :deep([data-block-id]:hover) {
  outline: 2px solid color-mix(in srgb, var(--sc-accent, #7d1c1c) 45%, transparent);
  outline-offset: 3px;
  border-radius: 2px;
}

/* Inspect: the pages the layout made, shown as one spread. The chapters' own
   page lists dissolve so every page is a flex item of the host. */
.paged-book--spread {
  display: flex;
  flex-direction: row;
  align-items: flex-start;
  box-shadow: 0 0.75rem 2.5rem rgb(0 0 0 / 0.45);
}
.paged-book--spread :deep(.pagedjs_pages) {
  display: contents !important;
}
.paged-book--spread :deep(.pagedjs_page) {
  margin: 0 !important;
  box-shadow: none !important;
}
/* Page 1 is a recto: the left half of its spread stays empty. */
.paged-book--lone::before {
  content: "";
  flex: none;
  width: var(--spread-page-width);
}
.paged-book--spread :deep([data-block-id]) {
  cursor: default;
}
.paged-book--spread :deep([data-block-id]:hover) {
  outline: none;
}
</style>
