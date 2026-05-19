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
            class="phb-body"
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

.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-heading-font: "Cinzel", Georgia, serif;
  --sc-body-font: Georgia, "Times New Roman", serif;
  --sc-ink: #1a1a1a;
  --sc-accent: #7d1c1c;
  --sc-accent-contrast: #f9f6ef;
  --sc-page-bg: #f9f6ef;
  --sc-callout-bg: #f5ece8;
  --sc-callout-border: var(--sc-accent);
  --sc-code-bg: #e4ddd0;
  --sc-col-rule: #c9b99a;
  --sc-h1-bg: var(--sc-accent);
  --sc-h1-color: var(--sc-accent-contrast);
  --sc-h1-border-b: none;
  --sc-h1-padding: 0.35rem 1rem;
  --sc-title-bar-bg: var(--sc-accent);
  --sc-title-bar-color: var(--sc-accent-contrast);
}

.phb-body.theme-phb2014,
.phb-page.theme-phb2014 {
  --sc-body-font: Georgia, "Palatino Linotype", "Book Antiqua", serif;
  --sc-accent: #58180d;
  --sc-accent-contrast: #eeeadf;
  --sc-page-bg: #eeeadf;
  --sc-callout-bg: #e0e5c1;
  --sc-h1-bg: transparent;
  --sc-h1-color: var(--sc-accent);
  --sc-h1-border-b: 3px double var(--sc-accent);
  --sc-h1-padding: 0.35rem 0 0.25rem;
}

.phb-bg {
  background: #a09a90;
  padding: 1.5rem 1rem 3rem;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 1.5rem;
  overscroll-behavior: contain;
}

.phb-two-col {
  column-count: 2;
  column-gap: 1.5rem;
  column-rule: 1px solid var(--sc-col-rule);
}
.phb-two-col :deep(h1),
.phb-two-col :deep(h2) {
  column-span: all;
}
.phb-two-col :deep(.sc-note h1),
.phb-two-col :deep(.sc-note h2),
.phb-two-col :deep(.sc-descriptive h1),
.phb-two-col :deep(.sc-descriptive h2),
.phb-two-col :deep(.sc-wide h1),
.phb-two-col :deep(.sc-wide h2) {
  column-span: none;
}

.phb-page.ink-friendly {
  --sc-callout-bg: transparent;
  --sc-page-bg: #fff;
  background: #fff;
}
.phb-page.ink-friendly :deep(.sc-watercolor),
.phb-page.ink-friendly :deep(.sc-watermark),
.phb-page.ink-friendly :deep(img.sc-decor) {
  display: none;
}
.phb-page.ink-friendly :deep(*) {
  background-image: none !important;
}

.phb-page {
  position: relative;
  background: url("/assets/scriptorium/page-background.webp") center / cover no-repeat;
  padding: 60px 68px 53px;
  box-shadow: 0 4px 24px rgba(0, 0, 0, 0.45);
  font-family: var(--sc-body-font);
  color: var(--sc-ink);
  line-height: 1.65;
  font-size: 15px;
  overflow: hidden;
}

.phb-title-bar {
  font-family: var(--sc-heading-font);
  font-size: 1.6rem;
  font-weight: 700;
  color: var(--sc-title-bar-color);
  background: var(--sc-title-bar-bg);
  padding: 0.6rem 2.5rem;
  margin: -2.5rem -2.5rem 1.75rem;
  letter-spacing: 0.04em;
  line-height: 1.25;
}

.phb-hint {
  font-family: "Cinzel", Georgia, serif;
  font-size: 0.65rem;
  color: rgba(255, 255, 255, 0.4);
  text-align: center;
  letter-spacing: 0.06em;
  padding: 0.5rem 0;
}

.phb-body :deep(h1) {
  font-family: var(--sc-heading-font);
  font-size: 1.25rem;
  font-weight: 700;
  color: var(--sc-h1-color);
  background: var(--sc-h1-bg);
  border-bottom: var(--sc-h1-border-b);
  padding: var(--sc-h1-padding);
  margin: 1.5rem -1rem 1rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(h2) {
  font-family: var(--sc-heading-font);
  font-size: 1.05rem;
  font-weight: 700;
  color: var(--sc-accent);
  border-bottom: 2px solid var(--sc-accent);
  padding-bottom: 0.2rem;
  margin: 1.25rem 0 0.6rem;
  letter-spacing: 0.02em;
}
.phb-body :deep(h3) {
  font-family: var(--sc-heading-font);
  font-size: 0.9375rem;
  font-weight: 600;
  font-style: italic;
  color: var(--sc-accent);
  margin: 1rem 0 0.35rem;
}
.phb-body :deep(p) {
  margin: 0 0 0.6rem;
  font-style: normal;
}
.phb-body :deep(ul),
.phb-body :deep(ol) {
  padding-left: 1.25rem;
  margin: 0.375rem 0 0.6rem;
}
.phb-body :deep(li) {
  margin: 0.2rem 0;
}
.phb-body :deep(blockquote) {
  border-left: 4px solid var(--sc-callout-border);
  background: var(--sc-callout-bg);
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
  border-radius: 0 4px 4px 0;
  font-style: italic;
}
.phb-body :deep(blockquote p) {
  margin: 0;
  font-style: italic;
}
.phb-body :deep(strong) {
  font-weight: 700;
}
.phb-body :deep(em) {
  font-style: italic;
}
.phb-body :deep(hr) {
  display: none;
}
.phb-body :deep(code) {
  background: var(--sc-code-bg);
  padding: 0.1em 0.35em;
  border-radius: 2px;
  font-family: "Courier New", monospace;
  font-size: 0.875em;
}
.phb-body :deep(pre) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  padding: 0.875rem;
  border-radius: 4px;
  overflow-x: auto;
  margin: 0.875rem 0;
  font-size: 0.875em;
}
.phb-body :deep(pre code) {
  background: transparent;
  padding: 0;
  color: inherit;
}

.phb-body :deep(.sc-spacer-v) {
  display: block;
  border: none;
}
.phb-body :deep(.sc-spacer-v::after) {
  display: none;
}
.phb-body :deep(.sc-spacer-h) {
  display: inline-block;
  border: none;
}

.phb-body :deep(.sc-column-break) {
  break-before: column;
  display: block;
  height: 0;
}

.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-decoration-watermark: var(--sc-accent);
  --sc-decoration-credit: var(--sc-ink);
}

.phb-body :deep(img[data-type="watercolor"]) {
  mix-blend-mode: multiply;
}

.phb-body :deep(.sc-wide) {
  column-span: all;
  margin: 0.75rem 0;
}

.phb-body :deep(div[data-type="coverPage"]) {
  position: absolute;
  inset: 0;
  overflow: hidden;
}

.phb-page:has(div[data-type="coverPage"][data-variant="back"]) .sc-footer,
.phb-page:has(div[data-type="coverPage"][data-variant="front"]) .sc-footer {
  display: none;
}

.sc-footer {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 68px;
  font-family: var(--sc-body-font);
  font-size: 12px;
  color: var(--sc-accent);
  box-sizing: border-box;
}

.sc-footer-text {
  font-style: italic;
  font-variant: small-caps;
}

.sc-footer-num {
  font-weight: 600;
}

.sc-footer--recto .sc-footer-num--left {
  display: none;
}
.sc-footer--verso .sc-footer-num--right {
  display: none;
}

.phb-body :deep(.sc-skip-counting),
.phb-body :deep(.sc-reset-counting) {
  display: none;
}

.phb-body :deep(.sc-toc) {
  font-family: var(--sc-body-font);
  color: var(--sc-ink);
  margin: 0.75rem 0 1rem;
}
.phb-body :deep(.sc-toc-heading) {
  font-family: var(--sc-heading-font);
  font-size: 1rem;
  font-weight: 700;
  color: var(--sc-accent);
  border-bottom: 2px solid var(--sc-accent);
  padding-bottom: 0.2rem;
  margin: 0 0 0.75rem;
  letter-spacing: 0.03em;
}
.phb-body :deep(.sc-toc-list) {
  list-style: none;
  padding: 0;
  margin: 0;
  column-count: 2;
  column-gap: 1.5rem;
}
.phb-body :deep(.sc-toc-item) {
  break-inside: avoid;
  margin: 0.2rem 0;
}
.phb-body :deep(.sc-toc-h2) {
  padding-left: 1rem;
  font-size: 0.875em;
}
.phb-body :deep(.sc-toc-h3) {
  padding-left: 2rem;
  font-size: 0.8125em;
  font-style: italic;
}
.phb-body :deep(.sc-toc-link) {
  display: flex;
  align-items: baseline;
  gap: 0.25rem;
  text-decoration: none;
  color: var(--sc-ink);
}
.phb-body :deep(.sc-toc-link:hover) {
  color: var(--sc-accent);
}
.phb-body :deep(.sc-toc-text) {
  white-space: nowrap;
  overflow: hidden;
  text-overflow: clip;
  flex-shrink: 1;
  min-width: 0;
}
.phb-body :deep(.sc-toc-leader) {
  flex: 1 1 auto;
  border-bottom: 1px dotted color-mix(in srgb, var(--sc-ink) 40%, transparent);
  align-self: flex-end;
  margin-bottom: 0.2em;
  min-width: 0.75rem;
}
.phb-body :deep(.sc-toc-page) {
  flex-shrink: 0;
  font-weight: 600;
  color: var(--sc-accent);
  min-width: 1.5rem;
  text-align: right;
}
.phb-body :deep(.sc-toc-empty) {
  color: color-mix(in srgb, var(--sc-ink) 50%, transparent);
  font-style: italic;
  font-size: 0.875em;
}

.phb-body :deep(.sc-class-table),
.phb-body :deep(.sc-class-table) {
  width: 100%;
  border-collapse: collapse;
  font-family: var(--sc-body-font, Georgia, serif);
  font-size: 0.6875rem;
  color: var(--sc-ink, #1a1a1a);
  line-height: 1.3;
  margin: 0.75rem 0;
}
.phb-body :deep(.sc-class-table th) {
  font-family: var(--sc-heading-font, "Cinzel", Georgia, serif);
  font-size: 0.75rem;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-align: center;
  color: var(--sc-accent-contrast, #f9f6ef);
  background: var(--sc-accent, #1b3a4b);
  padding: 0.3rem 0.5rem;
  border: 1px solid var(--sc-accent, #1b3a4b);
  white-space: normal;
  min-width: 0;
}
.phb-body :deep(.sc-class-table td) {
  text-align: center;
  padding: 0.2rem 0.4rem;
  border: 1px solid color-mix(in srgb, var(--sc-accent, #1b3a4b) 30%, transparent);
  vertical-align: middle;
}
.phb-body :deep(.sc-class-table td p),
.phb-body :deep(.sc-class-table th p) {
  margin: 0;
}
.phb-body :deep(.sc-class-table tr:nth-child(odd) td) {
  background: color-mix(in srgb, var(--sc-accent, #1b3a4b) 8%, transparent);
}
.phb-body :deep(.sc-class-table td:first-child) {
  font-weight: 700;
}

.phb-body.theme-onednd2024,
.phb-body.theme-phb2014,
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-callout-note-bg: var(--sc-callout-bg);
  --sc-callout-note-border: var(--sc-callout-border);
  --sc-callout-desc-bg: color-mix(in srgb, var(--sc-accent) 12%, var(--sc-page-bg));
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-quote-color: var(--sc-ink);
  --sc-callout-attr-color: color-mix(in srgb, var(--sc-accent) 80%, var(--sc-ink));
}

.phb-body.theme-phb2014,
.phb-page.theme-phb2014 {
  --sc-callout-note-bg: #e0e5c1;
  --sc-callout-note-border: var(--sc-accent);
  --sc-callout-desc-bg: #ddd8c4;
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-attr-color: var(--sc-accent);
}

.phb-body :deep(.sc-note) {
  background: var(--sc-callout-note-bg);
  border-left: 3px solid var(--sc-callout-note-border);
  border-radius: 0 4px 4px 0;
  padding: 0.6rem 0.875rem;
  margin: 0.875rem 0;
}
.phb-body :deep(.sc-note p) {
  margin: 0 0 0.4rem;
  font-size: 0.875em;
  font-style: italic;
}
.phb-body :deep(.sc-note p:last-child) {
  margin-bottom: 0;
}

.phb-body.theme-phb2014 :deep(.sc-note) {
  border-left: none;
  border-top: 2px double var(--sc-callout-note-border);
  border-bottom: 2px double var(--sc-callout-note-border);
  border-radius: 0;
  padding: 0.5rem 0.875rem;
}

.phb-body :deep(.sc-descriptive) {
  background: var(--sc-callout-desc-bg);
  border: 2px solid var(--sc-callout-desc-border);
  border-radius: 4px;
  padding: 0.875rem 1rem;
  margin: 0.875rem 0;
  font-style: italic;
}
.phb-body :deep(.sc-descriptive p) {
  margin: 0 0 0.5rem;
  font-style: italic;
}
.phb-body :deep(.sc-descriptive p:last-child) {
  margin-bottom: 0;
}

.phb-body.theme-phb2014 :deep(.sc-descriptive) {
  border-radius: 0;
  border-width: 3px;
}

.phb-body :deep(.sc-quote) {
  padding: 0.375rem 1rem;
  margin: 0.875rem 0;
  color: var(--sc-callout-quote-color);
  font-style: italic;
}
.phb-body :deep(.sc-quote p) {
  margin: 0 0 0.35rem;
  font-style: italic;
}
.phb-body :deep(.sc-quote p:last-child) {
  margin-bottom: 0;
}

.phb-body :deep(.sc-attribution) {
  font-style: normal;
  font-variant: small-caps;
  font-size: 0.875em;
  color: var(--sc-callout-attr-color);
  margin: 0.35rem 0 0;
  letter-spacing: 0.02em;
}
.phb-body :deep(.sc-attribution::before) {
  content: "\2014\00A0";
}

.phb-body :deep(.sc-ability-table) {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  margin: 6px 0 8px;
  font-family: var(--sc-body-font);
  font-size: 0.875em;
}
.phb-body :deep(.sc-ability-table th) {
  font-family: var(--sc-heading-font);
  font-size: 0.875em;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.03em;
  text-align: center;
  color: var(--sc-accent);
  padding: 1px 2px 3px;
  border: none;
  background: transparent;
}
.phb-body :deep(.sc-ability-table td) {
  text-align: center;
  padding: 1px 2px;
  border: none;
  color: var(--sc-ink);
}
.phb-body.theme-phb2014 :deep(.sc-ability-table th) {
  border-bottom: 1px solid var(--sc-accent);
}

.phb-body :deep(.sc-ability-table--2024) {
  table-layout: auto;
}
.phb-body :deep(.sc-ability-table--2024 thead th:not(.sc-abil-gap)) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  font-family: var(--sc-heading-font);
  font-size: 0.6875rem;
  font-variant: small-caps;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 4px 6px;
  border: none;
  white-space: nowrap;
}
.phb-body :deep(.sc-ability-table--2024 tbody td.sc-abil-name) {
  background: var(--sc-accent);
  color: var(--sc-accent-contrast);
  font-family: var(--sc-heading-font);
  font-size: 0.75rem;
  font-weight: 700;
  font-variant: small-caps;
  letter-spacing: 0.05em;
  text-align: center;
  padding: 3px 8px;
  border: none;
  white-space: nowrap;
}
.phb-body :deep(.sc-ability-table--2024 tbody td:not(.sc-abil-gap):not(.sc-abil-name)) {
  font-size: 0.875rem;
  text-align: center;
  padding: 2px 4px;
  color: var(--sc-ink);
  border-bottom: 1px solid color-mix(in srgb, var(--sc-accent) 15%, transparent);
}
.phb-body :deep(.sc-ability-table--2024 .sc-abil-gap) {
  width: 1rem;
  border: none !important;
  background: transparent !important;
  padding: 0;
}

.phb-body :deep(.sc-img-wrap--wrapLeft) {
  float: left;
  shape-outside: margin-box;
  margin: 0 1em 1em 0;
  clear: left;
}
.phb-body :deep(.sc-img-wrap--wrapRight) {
  float: right;
  shape-outside: margin-box;
  margin: 0 0 1em 1em;
  clear: right;
}
.phb-body :deep(.sc-img-wrap--wrapLeft.sc-img-wrap--gutter) {
  margin-left: -3em;
}
.phb-body :deep(.sc-img-wrap--wrapRight.sc-img-wrap--gutter) {
  margin-right: -3em;
}
.phb-body :deep(.sc-img-wrap--absolute) {
  position: absolute;
  z-index: 10;
}
</style>
