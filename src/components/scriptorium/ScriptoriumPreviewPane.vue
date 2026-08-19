<template>
  <div
    class="flex flex-col rounded-lg border border-border lg:overflow-hidden"
    style="background: #a09a90"
  >
    <div class="flex items-center justify-between px-4 py-2 border-b border-border bg-card shrink-0">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground uppercase tracking-widest">
        Preview — {{ themeInfo.label }}
      </p>
      <div class="flex items-center gap-2">
        <span
          class="px-1.5 py-0.5 rounded text-eyebrow font-bold"
          :style="{
            backgroundColor: docTypeColor(docType) + '22',
            color: docTypeColor(docType),
          }"
        >
          {{ docTypeLabel(docType) }}
        </span>

        <!-- Zoom controls -->
        <div class="flex items-center rounded border border-border overflow-hidden">
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

        <AppButton
          variant="subtle"
          size="xs"
          class="uppercase"
          :disabled="isGeneratingPdf"
          tooltip="Export as PDF"
          @click="onExportPdf"
        >
          <template #icon>
            <IconLoading v-if="isGeneratingPdf" class="h-3 w-3 animate-spin" />
            <IconExport v-else class="h-3 w-3" />
          </template>
          {{ isGeneratingPdf ? "Building…" : "PDF" }}
        </AppButton>
      </div>
    </div>

    <!-- Post-export tip: the saved PDF can carry campaign data (Phase E flow) -->
    <div
      v-if="showShareTip"
      class="flex items-start gap-2 px-4 py-2 border-b border-border bg-card/90 shrink-0"
    >
      <IconInfo class="h-3.5 w-3.5 mt-0.5 shrink-0 text-primary" />
      <p class="flex-1 text-caption text-muted-foreground leading-snug">
        Your saved PDF can carry campaign data — embed NPCs, monsters, and more so another DM can
        import them straight from this file. Go to
        <strong class="text-foreground">Campaign Settings → World Bundle → Attach to PDF</strong>, or
        <RouterLink
          :to="{ path: '/rules', query: { tab: 'manual', page: 'sharing-adventures-as-pdfs' } }"
          class="text-primary hover:underline"
        >read how in the DM Manual</RouterLink>.
      </p>
      <AppButton
        variant="ghost"
        size="inline-xs"
        class="shrink-0"
        :icon="IconClose"
        icon-size="xs"
        aria-label="Dismiss tip"
        @click="dismissShareTip"
      />
    </div>

    <!-- The auto-paginated book (Paged.js) — the live preview. -->
    <div
      ref="containerRef"
      class="phb-bg lg:flex-1 lg:overflow-auto lg:min-h-0"
      style="touch-action: pan-x pan-y"
    >
      <!-- Zoom is neutralised (1) while Paged.js renders: it measures the live
           DOM against the unscaled @page height, so an active zoom makes
           overflowing content look like it fits and pagination stops at one
           page. Display zoom is reapplied once the render settles. -->
      <div class="paged-scale" :style="{ zoom: isPaging ? 1 : effectiveZoom }">
        <div
          ref="pagedContainerRef"
          class="sc-theme paged-book"
          :class="themeInfo.class"
          title="Click any block to edit it"
          @click="onPagedClick"
        />
        <p v-if="pagedError" class="phb-hint text-destructive">{{ pagedError }}</p>
        <p v-else-if="isPaging" class="phb-hint">repaginating…</p>
        <p v-else class="phb-hint">{{ pageCount }} pages · {{ layoutMs }} ms</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconClose, IconExport, IconInfo, IconLoading, IconZoomIn, IconZoomOut } from "@/lib/icons";
import { docTypeLabel, docTypeColor } from "@/lib/scriptorium/editorConstants";
import { useScriptoriumZoom } from "@/composables/useScriptoriumZoom";
import { usePagedPreview } from "@/composables/usePagedPreview";
import { buildPagedPreviewCss } from "@/lib/scriptorium/pagedPreviewCss";
import { injectPagedFooters } from "@/lib/scriptorium/pagedFooters";
import { expandTocPlaceholder, fillPagedTocPages } from "@/lib/scriptorium/pagedToc";
import { stripTrailingEmptyParagraphs } from "@/lib/scriptorium/stripTrailingEmpty";
import { renderFurniture } from "@/lib/scriptorium/furniture/renderFurniture";
import { useFurnitureEditing } from "@/composables/useFurnitureEditing";
import type {
  ScriptoriumDocType,
  ScriptoriumTheme,
  ScriptoriumPageSize,
  PageFurnitureItem,
} from "@/types/scriptorium.types";

const {
  bodyHtml,
  footerText,
  showPageNumbers = false,
  pageNumberStart = 1,
  furniture = [],
  selectedFurnitureId = null,
  docType,
  theme,
  pageSize,
  inkFriendly,
  isTwoColumn,
  isGeneratingPdf = false,
} = defineProps<{
  /** Full document HTML — paginated by Paged.js into the book. */
  bodyHtml: string;
  footerText: string;
  showPageNumbers?: boolean;
  pageNumberStart?: number;
  /** Page-furniture decorations (Phase D). */
  furniture?: PageFurnitureItem[];
  selectedFurnitureId?: string | null;
  docType: ScriptoriumDocType;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  isTwoColumn: boolean;
  isGeneratingPdf?: boolean;
}>();

const emit = defineEmits<{
  exportPdf: [];
  editBlock: [blockId: string];
  "update:furniture": [items: PageFurnitureItem[]];
  "update:selectedFurnitureId": [id: string | null];
}>();

// Discovery tip for the attach-campaign-data flow (Phase E): shown after an
// export, when the user actually has a saved PDF in hand. Dismiss hides it
// for the rest of this editing session.
const showShareTip = ref(false);
const shareTipDismissed = ref(false);

function onExportPdf() {
  emit("exportPdf");
  if (!shareTipDismissed.value) showShareTip.value = true;
}

function dismissShareTip() {
  showShareTip.value = false;
  shareTipDismissed.value = true;
}

// Click-to-edit: resolve the clicked block's stable id (data-block-id, set by
// the BlockId extension and preserved through Paged.js fragmentation) and ask
// the editor to focus it in the galley.
function onPagedClick(e: MouseEvent) {
  const el = (e.target as HTMLElement).closest<HTMLElement>("[data-block-id]");
  const id = el?.dataset.blockId;
  if (id) emit("editBlock", id);
}

const containerRef = ref<HTMLElement | null>(null);
const pagedContainerRef = ref<HTMLElement | null>(null);

const pageSizeRef = computed(() => pageSize);
const {
  zoomMode,
  effectiveZoom,
  zoomLabel,
  zoomIn,
  zoomOut,
  zoomFit,
} = useScriptoriumZoom(pageSizeRef, containerRef);

const themeInfo = computed(() =>
  theme === "phb2014"
    ? { class: "theme-phb2014", label: "Classic PHB (2014)" }
    : { class: "theme-onednd2024", label: "OneDnD 2024" },
);

// ── Paged.js live preview ──────────────────────────────────────────────────
// Wrapping in .phb-two-col makes the whole body a two-column flow that Paged.js
// fragments across pages.
const {
  pageCount,
  layoutMs,
  isRendering: isPaging,
  error: pagedError,
  scheduleRender,
} = usePagedPreview({
  content: () => {
    // Expand the TOC to full height before layout so heading page numbers stay
    // accurate even when the TOC overflows onto extra pages (#465).
    const html = expandTocPlaceholder(stripTrailingEmptyParagraphs(bodyHtml), { showPageNumbers });
    return isTwoColumn ? `<div class="phb-two-col">${html}</div>` : html;
  },
  stylesheets: () => [
    { "scriptorium-paged.css": buildPagedPreviewCss({ pageSize, inkFriendly }) },
  ],
  container: pagedContainerRef,
  afterRender: (el) => {
    // Footers and the TOC both derive page numbers from the laid-out pages,
    // so they run together after each render.
    injectPagedFooters(el, { showPageNumbers, footerText, start: pageNumberStart });
    fillPagedTocPages(el, { showPageNumbers, start: pageNumberStart });
    renderFurniture(el, furniture, { interactive: true, selectedId: selectedFurnitureId });
  },
});

// Furniture is an overlay on the laid-out pages — adding/moving/editing it
// re-renders the decorations in place, no re-pagination.
watch(
  () => [furniture, selectedFurnitureId] as const,
  () => {
    if (pagedContainerRef.value) {
      renderFurniture(pagedContainerRef.value, furniture, {
        interactive: true,
        selectedId: selectedFurnitureId,
      });
    }
  },
  { deep: true },
);

useFurnitureEditing({
  container: pagedContainerRef,
  enabled: () => true,
  items: () => furniture,
  onChange: (items) => emit("update:furniture", items),
  onSelect: (id) => emit("update:selectedFurnitureId", id),
});

// Footer/numbering settings aren't part of the content or stylesheets, so they
// don't auto-trigger a render — but they change footer labels AND TOC page
// numbers, and the TOC placeholder is consumed on first injection. Re-render
// (debounced) so both stay consistent. These settings change rarely.
watch(() => [showPageNumbers, footerText, pageNumberStart] as const, () => scheduleRender());

watch(() => pageSize, () => {
  zoomFit();
});
</script>

<style scoped>
@reference "@/assets/main.css";

/*
 * Layout-only styles. All theming (page look, typography, callouts, tables,
 * footers, ink-friendly, two-column) lives in the shared theme files at
 * src/assets/scriptorium/ — the single source of truth consumed by this
 * preview, the editor galley, and the PDF export. Do not re-add theme rules
 * here.
 */
.phb-bg {
  background: #a09a90;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  overscroll-behavior: contain;
}

/* The Paged.js path fills the width; `zoom` scales it and keeps scroll dims. */
.paged-scale {
  width: 100%;
  align-self: stretch;
}

/* Click-to-edit affordance: hovering a block in the book hints it's editable. */
.paged-book :deep([data-block-id]) {
  cursor: pointer;
}
.paged-book :deep([data-block-id]:hover) {
  outline: 2px solid color-mix(in srgb, var(--sc-accent, #7d1c1c) 45%, transparent);
  outline-offset: 3px;
  border-radius: 2px;
}

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}
</style>
