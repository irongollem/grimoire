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
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { IconExport, IconLoading, IconZoomIn, IconZoomOut } from "@/lib/icons";
import { docTypeLabel, docTypeColor } from "@/lib/scriptorium/editorConstants";
import { useScriptoriumZoom } from "@/composables/useScriptoriumZoom";
import type { ScriptoriumDocType, ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";

const {
  pages,
  pageFooters,
  footerText,
  docType,
  theme,
  pageSize,
  inkFriendly,
  isTwoColumn,
  isGeneratingPdf = false,
} = defineProps<{
  pages: string[];
  pageFooters: (string | null)[];
  footerText: string;
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

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}

</style>
