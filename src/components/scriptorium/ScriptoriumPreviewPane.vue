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
          class="px-1.5 py-0.5 rounded font-cinzel text-[10px] font-bold tracking-wider uppercase"
          :style="{
            backgroundColor: docTypeColor(docType) + '22',
            color: docTypeColor(docType),
          }"
        >
          {{ docTypeLabel(docType) }}
        </span>

        <!-- Auto-pagination (Paged.js) toggle — beta -->
        <button
          type="button"
          :title="pagedMode ? 'Auto-paginated preview (beta) — click for legacy' : 'Switch to auto-paginated preview (beta)'"
          class="inline-flex items-center gap-1 px-2 h-6.5 rounded border font-cinzel text-[9px] font-semibold tracking-wider uppercase transition-colors"
          :class="pagedMode
            ? 'border-primary/50 text-primary bg-primary/10'
            : 'border-border text-muted-foreground hover:text-foreground hover:bg-muted'"
          @click="pagedMode = !pagedMode"
        >
          Auto-pages
          <span class="text-[8px] opacity-70">{{ pagedMode ? "BETA" : "off" }}</span>
        </button>

        <!-- Zoom controls -->
        <div class="flex items-center rounded border border-border overflow-hidden">
          <button
            type="button"
            title="Zoom out"
            :disabled="effectiveZoom <= 0.25"
            class="px-1.5 h-6.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            @click="zoomOut"
          >
            <IconZoomOut class="h-3 w-3" />
          </button>
          <button
            type="button"
            :title="zoomMode === 'fit' ? 'Fit to width' : 'Click to fit to width'"
            class="px-1.5 h-6.5 font-cinzel text-[9px] font-semibold tracking-wider border-x border-border transition-colors min-w-9.5 text-center"
            :class="zoomMode === 'fit' ? 'text-primary bg-primary/10' : 'text-muted-foreground hover:text-foreground hover:bg-muted'"
            @click="zoomFit"
          >
            {{ zoomMode === "fit" ? "Fit" : zoomLabel }}
          </button>
          <button
            type="button"
            title="Zoom in"
            :disabled="effectiveZoom >= 2.0"
            class="px-1.5 h-6.5 text-muted-foreground hover:text-foreground hover:bg-muted transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
            @click="zoomIn"
          >
            <IconZoomIn class="h-3 w-3" />
          </button>
        </div>

        <button
          type="button"
          title="Export as PDF"
          :disabled="isGeneratingPdf"
          class="inline-flex items-center gap-1 px-2 py-1 rounded font-cinzel text-[10px] font-semibold border border-border text-muted-foreground hover:text-foreground hover:border-foreground/40 transition-colors tracking-wider uppercase disabled:opacity-50 disabled:cursor-not-allowed"
          @click="$emit('exportPdf')"
        >
          <IconLoading v-if="isGeneratingPdf" class="h-3 w-3 animate-spin" />
          <IconExport v-else class="h-3 w-3" />
          {{ isGeneratingPdf ? "Building…" : "PDF" }}
        </button>
      </div>
    </div>

    <div
      ref="containerRef"
      class="phb-bg lg:flex-1 lg:overflow-auto lg:min-h-0"
      style="touch-action: pan-x pan-y"
    >
      <!-- Legacy manual-pagination preview (split on page breaks) -->
      <template v-if="!pagedMode">
        <div
          v-for="(pageHtml, pageIndex) in pages"
          :key="pageIndex"
          :style="pageWrapperStyle"
        >
          <div
            class="phb-page"
            :class="[themeInfo.class, { 'ink-friendly': inkFriendly }]"
            :style="pageInnerStyle"
          >
            <div
              class="phb-body sc-theme"
              :class="[themeInfo.class, { 'phb-two-col': isTwoColumn }]"
              v-html="pageHtml"
            />
            <div
              v-if="pageFooters[pageIndex] !== null"
              class="sc-footer"
              :class="pageIndex % 2 === 0 ? 'sc-footer--recto' : 'sc-footer--verso'"
            >
              <span class="sc-footer-num sc-footer-num--left">{{ pageFooters[pageIndex] }}</span>
              <span class="sc-footer-text">{{ footerText }}</span>
              <span class="sc-footer-num sc-footer-num--right">{{ pageFooters[pageIndex] }}</span>
            </div>
          </div>
        </div>
        <p class="phb-hint">── use the Page Break button (—) to start a new page ──</p>
      </template>

      <!-- Auto-paginated preview (Paged.js) — the real book, beta -->
      <div v-show="pagedMode" class="paged-scale" :style="{ zoom: effectiveZoom }">
        <div
          ref="pagedContainerRef"
          class="sc-theme"
          :class="themeInfo.class"
        />
        <p v-if="pagedError" class="phb-hint text-destructive">{{ pagedError }}</p>
        <p v-else-if="isPaging" class="phb-hint">repaginating…</p>
        <p v-else-if="pagedMode" class="phb-hint">{{ pageCount }} pages · {{ layoutMs }} ms</p>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconExport, IconLoading, IconZoomIn, IconZoomOut } from "@/lib/icons";
import { docTypeLabel, docTypeColor } from "@/lib/scriptorium/editorConstants";
import { useScriptoriumZoom } from "@/composables/useScriptoriumZoom";
import { usePagedPreview } from "@/composables/usePagedPreview";
import { buildPagedPreviewCss } from "@/lib/scriptorium/pagedPreviewCss";
import { injectPagedFooters } from "@/lib/scriptorium/pagedFooters";
import type { ScriptoriumDocType, ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";

const {
  pages,
  pageFooters,
  bodyHtml,
  footerText,
  showPageNumbers = false,
  pageNumberStart = 1,
  docType,
  theme,
  pageSize,
  inkFriendly,
  isTwoColumn,
  isGeneratingPdf = false,
} = defineProps<{
  pages: string[];
  pageFooters: (string | null)[];
  /** Full unsplit document HTML — fed to the Paged.js path. */
  bodyHtml: string;
  footerText: string;
  showPageNumbers?: boolean;
  pageNumberStart?: number;
  docType: ScriptoriumDocType;
  theme: ScriptoriumTheme;
  pageSize: ScriptoriumPageSize;
  inkFriendly: boolean;
  isTwoColumn: boolean;
  isGeneratingPdf?: boolean;
}>();

defineEmits<{
  exportPdf: [];
}>();

const containerRef = ref<HTMLElement | null>(null);
const pagedContainerRef = ref<HTMLElement | null>(null);

// The Paged.js book is the default preview. The toggle still allows dropping
// to the legacy manual-pagination view (which also feeds the current PDF
// export) until the print-iframe export replaces it.
const pagedMode = ref(true);

const pageSizeRef = computed(() => pageSize);
const {
  zoomMode,
  effectiveZoom,
  zoomLabel,
  zoomIn,
  zoomOut,
  zoomFit,
  pageWrapperStyle,
  pageInnerStyle,
} = useScriptoriumZoom(pageSizeRef, containerRef);

const themeInfo = computed(() =>
  theme === "phb2014"
    ? { class: "theme-phb2014", label: "Classic PHB (2014)" }
    : { class: "theme-onednd2024", label: "OneDnD 2024" },
);

// ── Paged.js live preview ──────────────────────────────────────────────────
// Content is empty until the mode is on, so Paged.js doesn't run for users who
// stay on the legacy preview. Wrapping in .phb-two-col makes the whole body a
// two-column flow that Paged.js fragments across pages.
const {
  pageCount,
  layoutMs,
  isRendering: isPaging,
  error: pagedError,
} = usePagedPreview({
  content: () => {
    if (!pagedMode.value) return "";
    return isTwoColumn ? `<div class="phb-two-col">${bodyHtml}</div>` : bodyHtml;
  },
  stylesheets: () => [
    { "scriptorium-paged.css": buildPagedPreviewCss({ pageSize, inkFriendly }) },
  ],
  container: pagedContainerRef,
  afterRender: (el) =>
    injectPagedFooters(el, { showPageNumbers, footerText, start: pageNumberStart }),
});

// Footer settings don't change content, so they don't trigger a re-render —
// re-inject footers in place when they change (cheap, no re-pagination).
watch(
  () => [showPageNumbers, footerText, pageNumberStart] as const,
  () => {
    if (pagedMode.value && pagedContainerRef.value) {
      injectPagedFooters(pagedContainerRef.value, {
        showPageNumbers,
        footerText,
        start: pageNumberStart,
      });
    }
  },
);

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

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}
</style>
