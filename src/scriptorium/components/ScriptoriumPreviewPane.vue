<template>
  <section
    :class="reading ? 'scriptorium-inspect fixed inset-0 z-40 flex flex-col bg-background' : 'preview-offscreen'"
    :style="reading ? inspectChrome : undefined"
    :aria-label="reading ? 'Read the book as spreads' : undefined"
    :aria-hidden="reading ? undefined : true"
    data-testid="preview-pane"
  >
    <ScriptoriumInspectBar
      v-if="reading"
      v-model:spread="spread"
      v-model:notes-open="notesOpen"
      :document-id="documentId"
      :title="title"
      :chapters="chapterSummaries"
      :result="result"
      @close="emit('close')"
    />

    <div class="flex min-h-0 flex-1">
      <div
        ref="containerRef"
        class="preview-stage min-h-0 min-w-0 flex-1"
        :class="reading ? 'flex items-center justify-center overflow-hidden' : ''"
        style="touch-action: pan-x pan-y"
      >
        <!-- The display scale is a transform, never CSS `zoom`: `zoom` makes the
             browser lay the text out again at the scaled size, where a line can
             break a pixel differently and spill past the page bottom. The box
             around it takes the scaled size so the scroll area matches what is
             drawn. The scale is neutralised (1) while Paged.js renders: it
             measures the live DOM against the unscaled @page height. -->
        <div class="paged-scale-box" :style="scaleBoxStyle">
          <div ref="scaleRef" class="paged-scale" :style="{ transform: `scale(${displayScale})` }">
            <div
              ref="hostRef"
              class="sc-theme paged-book"
              :class="[
                ...surfaceClasses,
                { 'paged-book--spread': reading, 'paged-book--lone': reading && spread === 0 },
              ]"
              :style="{ ...surfaceStyle, '--spread-page-width': `${pageBox.w}px` }"
            />
            <!-- Nothing written yet: the layout has no pages, so show the bare
                 sheet in its look rather than an empty stage. -->
            <div
              v-if="blankSheet"
              class="sc-theme"
              :class="[...surfaceClasses, { 'ink-friendly': settings.inkFriendly }]"
              :style="surfaceStyle"
              data-testid="preview-blank-sheet"
              aria-hidden="true"
            >
              <div
                class="phb-page"
                :class="{ 'ink-friendly': settings.inkFriendly }"
                :style="{ width: `${pageBox.w}px`, height: `${pageBox.h}px` }"
              />
            </div>
          </div>
        </div>
        <p v-if="error" class="px-4 py-3 text-caption text-destructive" role="alert">{{ error }}</p>
        <slot name="layer" :host="hostEl" />
      </div>
      <div v-if="reading && notesOpen" class="flex min-h-0 w-72 shrink-0 flex-col overflow-y-auto border-l border-border bg-card">
        <slot name="drawer" />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
/**
 * The book as it will print, laid out chapter by chapter by the book layout
 * engine (#1115 story 13, #1176 story 1). There is one host element and the
 * layout runs whenever a book is open; there are two ways it is shown:
 *
 *  - Off screen (the page you write on): the host keeps real layout but is
 *    hidden and out of the way. The chapter editor draws the pages and the
 *    furniture itself from the flow this reports, so nothing here is seen or
 *    clicked.
 *  - Read as spreads: the same laid-out pages re-styled as one spread at a
 *    time, full screen and lamplit. Nothing is laid out again to get there.
 *
 * The footers, the contents page and the furniture are written by the engine;
 * this component only decides what is on screen.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from "vue";
import ScriptoriumInspectBar from "@/scriptorium/components/ScriptoriumInspectBar.vue";
import { scaledBoxSize } from "@/scriptorium/composables/useScriptoriumZoom";
import { useBookPreview } from "@/scriptorium/composables/useBookPreview";
import { useHotkeys } from "@/composables/useHotkeys";
import { buildPagedPreviewCss } from "@/scriptorium/lib/pagedPreviewCss";
import { renderFurniture } from "@/scriptorium/lib/furniture/renderFurniture";
import { activeDressing, type Dressing } from "@/scriptorium/dressing/dressing";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/scriptorium/lib/editorConstants";
import { measureChapterFlow } from "@/scriptorium/lib/pageFlow/measureFlow";
import type { ChapterFlow } from "@/scriptorium/lib/pageFlow/types";
import { bookSurfaceClasses, bookSurfaceStyle } from "@/scriptorium/lib/looks";
import { activeThemeId, darkTwinStyle } from "@/lib/themeRuntime";
import { spreadCount, spreadPages } from "@/scriptorium/lib/spreads";
import type { BookChapterInput, BookLayoutResult, BookLayoutSettings } from "@/scriptorium/lib/bookLayout/types";
import type {
  PageFurnitureItem,
  ScriptoriumChapterSummary,
  ScriptoriumFooterStyle,
  ScriptoriumPaperTone,
} from "@/scriptorium/types";

/** Read as spreads is lamplit (frame 04): the campaign theme's dark twin, whatever the viewer's light/dark setting. */
const inspectChrome = computed(() => darkTwinStyle(activeThemeId.value));
const {
  documentId,
  title,
  chapters,
  changes,
  settings,
  chapterSummaries,
  reading,
  focusChapterId = null,
  furniture = [],
  dressing = null,
  handout = false,
  paperTone = null,
  footerStyle = "plain",
} = defineProps<{
  documentId: string;
  title: string;
  /** Builds the chapters' HTML; called only when a render runs. */
  chapters: () => BookChapterInput[];
  /** Changes whenever `chapters` would return something different. */
  changes: number;
  settings: BookLayoutSettings;
  chapterSummaries: ScriptoriumChapterSummary[];
  /** Read as spreads is open: the host is shown, one spread at a time. */
  reading: boolean;
  focusChapterId?: string | null;
  /** Written onto the pages by the engine; never interactive here, the editor's pages are where furniture is edited. */
  furniture?: PageFurnitureItem[];
  /** The book's page dressing, drawn under everything on each page (#1181); ink-friendly leaves it off. */
  dressing?: Dressing | null;
  /** A handout is one sheet: its dressing is laid out as one page. */
  handout?: boolean;
  /** The book's own paper and footer style; they change no layout, so they are not part of `settings`. */
  paperTone?: ScriptoriumPaperTone | null;
  footerStyle?: ScriptoriumFooterStyle;
}>();

const emit = defineEmits<{
  layout: [result: BookLayoutResult | null];
  progress: [progress: { done: number; total: number } | null];
  /** Where the open chapter's pages and columns start, after each layout. */
  flow: [flow: ChapterFlow];
  close: [];
}>();

const notesOpen = defineModel<boolean>("notesOpen", { default: false });
const spread = ref(0);

const containerRef = ref<HTMLElement | null>(null);
const hostRef = ref<HTMLElement | null>(null);
const hostEl = computed(() => hostRef.value);

const pageBox = computed(() => EDITOR_PAGE_DIMENSIONS_PX[settings.pageSize]);

const surfaceClasses = computed(() =>
  bookSurfaceClasses({ theme: settings.theme, paperTone, footerStyle, inkFriendly: settings.inkFriendly }),
);

const surfaceStyle = computed(() => bookSurfaceStyle({ paperTone, inkFriendly: settings.inkFriendly }));

/** Every pass that draws furniture draws the dressing with it, so a re-draw in place cannot lose it. */
function furnitureOptions() {
  return { interactive: false, selectedId: null, dressing: activeDressing(dressing, settings.inkFriendly), handout };
}

const { isRendering, error, result, progress } = useBookPreview({
  chapters: () => chapters(),
  changes: () => changes,
  settings: () => settings,
  stylesheets: () => [
    { "scriptorium-paged.css": buildPagedPreviewCss({ pageSize: settings.pageSize, inkFriendly: settings.inkFriendly }) },
  ],
  furniture: () => ({ items: furniture, options: furnitureOptions() }),
  focusChapterId: () => focusChapterId,
  container: hostRef,
  afterRender: () => {
    emitFlow();
    applySpread();
  },
});

// ── The open chapter's pages, for the editor to draw (#1175) ────────────────
/** Where the layout starts each page and column of the chapter being written. */
function emitFlow() {
  const host = hostRef.value;
  // Reading hides every page but one spread, so it measures nothing.
  if (!host || reading || !focusChapterId) return;
  const pages = Array.from(host.querySelectorAll<HTMLElement>(".pagedjs_page"));
  emit("flow", measureChapterFlow(pages, { chapterId: focusChapterId, twoColumn: settings.isTwoColumn }));
}
// A chapter switch lands on pages already laid out (the engine caches them).
watch(
  () => focusChapterId,
  () => {
    if (!isRendering.value) void nextTick(emitFlow);
  },
);

watch(result, (value) => emit("layout", value));

/** A book or handout with nothing on it yet lays out to no pages at all (the engine never paginates an empty chapter). */
const blankSheet = computed(() => reading && !isRendering.value && !error.value && result.value?.pageCount === 0);
watch(progress, (value) => emit("progress", value));

// ── Scale (Read as spreads fits one whole spread in the stage) ──────────────
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
});
onBeforeUnmount(() => observer?.disconnect());

const fitScale = computed(() => {
  const gutter = 48;
  const byWidth = (stageSize.value.w - gutter) / (pageBox.value.w * 2);
  const byHeight = (stageSize.value.h - gutter) / pageBox.value.h;
  const fit = Math.min(byWidth, byHeight);
  return Number.isFinite(fit) && fit > 0 ? Math.min(fit, 1.5) : 1;
});
/** The scale is neutralised (1) while Paged.js renders, and off screen: it measures the live DOM against the unscaled @page height. */
const displayScale = computed(() => (isRendering.value || !reading ? 1 : fitScale.value));
const scaleBoxStyle = computed(() => {
  if (!reading) return undefined;
  const { width, height } = scaledBoxSize(contentSize.value, displayScale.value);
  return { width: `${width}px`, height: `${height}px` };
});

// ── Furniture (an overlay on the laid-out pages: re-drawn in place, never re-laid out) ──
watch(
  [() => furniture, () => dressing, () => settings.inkFriendly],
  () => {
    if (hostRef.value) renderFurniture(hostRef.value, furniture, furnitureOptions());
  },
  { deep: true },
);

// ── Spreads ─────────────────────────────────────────────────────────────────
function applySpread() {
  const host = hostRef.value;
  if (!host) return;
  const pages = host.querySelectorAll<HTMLElement>(".pagedjs_page");
  if (!reading) {
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
watch(
  () => [spread.value, reading] as const,
  () => {
    applySpread();
    // Back on the page: a layout that finished while reading was never measured.
    if (!reading) void nextTick(emitFlow);
  },
);
watch(() => result.value, () => applySpread());

useHotkeys(
  [
    { combo: "arrowleft", description: "Previous spread", handler: () => (spread.value = Math.max(0, spread.value - 1)) },
    {
      combo: "arrowright",
      description: "Next spread",
      handler: () => (spread.value = Math.min(spreadCount(result.value?.pageCount ?? 0) - 1, spread.value + 1)),
    },
    { combo: "escape", description: "Close Read as spreads", handler: () => emit("close"), hidden: true },
  ],
  { layer: "overlay", enabled: () => reading },
);

defineExpose({ host: hostRef, spread });
</script>

<style scoped>
@reference "@/assets/main.css";

/*
 * Layout-only styles. All theming (page look, typography, callouts, tables,
 * footers, ink-friendly, two-column) lives in the shared theme files at
 * src/scriptorium/styles/, consumed by this preview, the editor galley and the
 * PDF export. Do not re-add theme rules here.
 */
/*
 * Off screen the host still has real layout (Paged.js measures it), so it is
 * hidden with `visibility`, never `display: none`, and parked in a zero-height
 * clip at the top of the editor, where it can never scroll the page.
 */
.preview-offscreen {
  position: absolute;
  top: 0;
  left: 0;
  width: 100vw;
  height: 0;
  overflow: hidden;
  visibility: hidden;
  pointer-events: none;
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

/* Read as spreads: the pages the layout made, shown as one spread. The chapters' own
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
</style>
