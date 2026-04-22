import { ref, onUnmounted } from "vue";
import type { ComputedRef, Ref } from "vue";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";
import { injectPageAnchors } from "@/lib/tiptap/tocBlock";

/** Footer bar styles shared between both themes (onednd2024 defaults; phb2014 overrides). */
const FOOTER_CSS = `
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
  border-top: 1px solid var(--sc-accent);
  box-sizing: border-box;
}
.phb-page.theme-onednd2024 .sc-footer-text {
  font-style: italic;
  font-variant: small-caps;
}
.phb-page.theme-phb2014 .sc-footer-text {
  font-style: italic;
  font-variant: small-caps;
}
.sc-footer-num {
  font-weight: 600;
}
/* Marker atoms — invisible in PDF output */
.sc-skip-counting,
.sc-reset-counting {
  display: none;
}
`;

/*
 * Page dimensions at 96 dpi (px → mm mapping for jsPDF).
 *
 * html2canvas viewport: w × h pixels.
 * jsPDF page: mmW × mmH mm (portrait).
 */
const PAGE_SIZES: Record<ScriptoriumPageSize, { w: number; h: number; mmW: number; mmH: number; format: string }> = {
  A4:     { w: 794,  h: 1123, mmW: 210, mmH: 297, format: "a4" },
  A5:     { w: 559,  h: 794,  mmW: 148, mmH: 210, format: "a5" },
  Letter: { w: 816,  h: 1056, mmW: 216, mmH: 279, format: "letter" },
} as const;

/*
 * Pixel-unit styles for html2canvas rendering.
 *
 * Palette and typography are driven by CSS custom properties — the same
 * contract as the preview (see ScriptoriumEditor.vue). The theme class
 * (`theme-onednd2024` | `theme-phb2014`) is applied to each `.phb-page`
 * element so the variables resolve correctly in the rendered canvas.
 *
 * TODO: upgrade the web-safe serif fallback to licensed faces once sorted.
 */
const RENDER_CSS = `
* { box-sizing: border-box; }
.phb-page.theme-onednd2024,
.phb-page.theme-phb2014 {
  --sc-heading-font: 'Cinzel', Georgia, serif;
  --sc-body-font: Georgia, 'Times New Roman', serif;
  --sc-ink: #1a1a1a;
  --sc-accent: #1B3A4B;
  --sc-accent-contrast: #F9F6EF;
  --sc-page-bg: #F9F6EF;
  --sc-callout-bg: #E8F4F8;
  --sc-callout-border: var(--sc-accent);
  --sc-code-bg: #e4ddd0;
  --sc-h1-bg: var(--sc-accent);
  --sc-h1-color: var(--sc-accent-contrast);
  --sc-h1-border-b: none;
  --sc-h1-padding: 5px 14px;
  --sc-title-bar-bg: var(--sc-accent);
  --sc-title-bar-color: var(--sc-accent-contrast);
}
.phb-page.theme-phb2014 {
  --sc-body-font: Georgia, 'Palatino Linotype', 'Book Antiqua', serif;
  --sc-accent: #58180D;
  --sc-accent-contrast: #EEEADF;
  --sc-page-bg: #EEEADF;
  --sc-callout-bg: #E0E5C1;
  --sc-h1-bg: transparent;
  --sc-h1-color: var(--sc-accent);
  --sc-h1-border-b: 3px double var(--sc-accent);
  --sc-h1-padding: 5px 0 4px;
}
.phb-page { position:relative; width:var(--sc-page-w,794px); height:var(--sc-page-h,1123px); background:var(--sc-page-bg); padding:60px 68px 53px; overflow:hidden; font-family:var(--sc-body-font); color:var(--sc-ink); line-height:1.65; font-size:15px; }
.phb-border { position:absolute; inset:0; width:100%; height:100%; pointer-events:none; opacity:.65; }
.phb-title-bar { font-family:var(--sc-heading-font); font-size:26px; font-weight:700; color:var(--sc-title-bar-color); background:var(--sc-title-bar-bg); padding:9px 68px; margin:-60px -68px 28px; letter-spacing:.04em; line-height:1.25; }
h1 { font-family:var(--sc-heading-font); font-size:19px; font-weight:700; color:var(--sc-h1-color); background:var(--sc-h1-bg); border-bottom:var(--sc-h1-border-b); padding:var(--sc-h1-padding); margin:19px -5px 11px; }
h2 { font-family:var(--sc-heading-font); font-size:16px; font-weight:700; color:var(--sc-accent); border-bottom:2px solid var(--sc-accent); padding-bottom:3px; margin:16px 0 7px; }
h3 { font-family:var(--sc-heading-font); font-size:15px; font-weight:600; font-style:italic; color:var(--sc-accent); margin:13px 0 4px; }
p { margin:0 0 7px; } ul,ol { padding-left:19px; margin:4px 0 7px; } li { margin:2px 0; }
blockquote { border-left:4px solid var(--sc-callout-border); background:var(--sc-callout-bg); padding:8px 11px; margin:11px 0; border-radius:0 4px 4px 0; font-style:italic; }
blockquote p { margin:0; } strong { font-weight:700; } em { font-style:italic; }
code { background:var(--sc-code-bg); padding:1px 4px; border-radius:2px; font-family:'Courier New',monospace; font-size:13px; }
pre { background:var(--sc-accent); color:var(--sc-accent-contrast); padding:11px; border-radius:4px; overflow:hidden; margin:11px 0; font-size:13px; }
pre code { background:transparent; padding:0; color:inherit; }
img:not(.phb-border) { max-width:380px; max-height:480px; border-radius:4px; object-fit:cover; }
.ink-friendly { --sc-callout-bg: transparent; --sc-page-bg: #fff; }
.ink-friendly .sc-watercolor,
.ink-friendly .sc-watermark,
.ink-friendly img.sc-decor { display: none; }
.ink-friendly .phb-border { display: none; }
.ink-friendly * { background-image: none !important; }
.sc-spacer-v { display:block; border:none; }
.sc-spacer-h { display:inline-block; border:none; }
/* Column break: invisible, forces CSS multi-column break */
.sc-column-break { break-before:column; display:block; height:0; }
/* Wide block: spans both columns in multi-column layout; no-op in single-column */
.sc-wide { column-span:all; margin:12px 0; }
/* Decoration variables — resolved via existing palette vars for both themes */
.phb-page.theme-onednd2024, .phb-page.theme-phb2014 { --sc-decoration-watermark:var(--sc-accent); --sc-decoration-credit:var(--sc-ink); }
/* Watercolor overlay: mix-blend-mode blends the splatter with the parchment */
img[data-type="watercolor"] { mix-blend-mode:multiply; }
/* Watermark wrapper fills the page (absolute via inline style from renderHTML) */
div[data-type="watermark"] { overflow:hidden; }
/* Artist credit positioned via inline style from renderHTML — no extra rules needed */
/* Cover page: fills the entire .phb-page; children are absolutely positioned by renderHTML */
div[data-type="coverPage"] { position:absolute; inset:0; overflow:hidden; }
/* Cover page suppresses the title bar and page border on that page */
.phb-page:has(div[data-type="coverPage"]) .phb-title-bar,
.phb-page:has(div[data-type="coverPage"]) .phb-border { display:none; }
/* Cover page suppresses the footer on front + back variants */
.phb-page:has(div[data-type="coverPage"][data-variant="front"]) .sc-footer,
.phb-page:has(div[data-type="coverPage"][data-variant="back"]) .sc-footer { display:none; }
/* Table of Contents — both themes use palette vars so no per-theme overrides needed */
.sc-toc { font-family:var(--sc-body-font); color:var(--sc-ink); margin:11px 0 14px; }
.sc-toc-heading { font-family:var(--sc-heading-font); font-size:15px; font-weight:700; color:var(--sc-accent); border-bottom:2px solid var(--sc-accent); padding-bottom:3px; margin:0 0 11px; }
.sc-toc-list { list-style:none; padding:0; margin:0; column-count:2; column-gap:22px; }
.sc-toc-item { break-inside:avoid; margin:3px 0; }
.sc-toc-h2 { padding-left:14px; font-size:13px; }
.sc-toc-h3 { padding-left:28px; font-size:12px; font-style:italic; }
.sc-toc-link { display:flex; align-items:baseline; gap:4px; text-decoration:none; color:var(--sc-ink); }
.sc-toc-text { white-space:nowrap; overflow:hidden; text-overflow:clip; flex-shrink:1; min-width:0; }
.sc-toc-leader { flex:1 1 auto; border-bottom:1px dotted rgba(26,26,26,0.4); align-self:flex-end; margin-bottom:3px; min-width:11px; }
.sc-toc-page { flex-shrink:0; font-weight:600; color:var(--sc-accent); min-width:22px; text-align:right; }
.sc-toc-empty { color:rgba(26,26,26,0.5); font-style:italic; font-size:13px; }
/* Class progression table — palette-variable driven, both themes */
.sc-class-table { width:100%; border-collapse:collapse; font-family:var(--sc-body-font,Georgia,serif); font-size:13px; color:var(--sc-ink,#1a1a1a); line-height:1.3; margin:11px 0; }
.sc-class-table th { font-family:var(--sc-heading-font,'Cinzel',Georgia,serif); font-size:12px; font-variant:small-caps; font-weight:700; letter-spacing:.04em; text-align:center; color:var(--sc-accent-contrast,#f9f6ef); background:var(--sc-accent,#1b3a4b); padding:4px 7px; border:1px solid var(--sc-accent,#1b3a4b); white-space:nowrap; }
.sc-class-table td { text-align:center; padding:3px 6px; border:1px solid rgba(27,58,75,0.3); vertical-align:middle; }
.sc-class-table td p, .sc-class-table th p { margin:0; }
.sc-class-table tr:nth-child(odd) td { background:rgba(27,58,75,0.08); }
.sc-class-table td:first-child { font-weight:700; }
/* Callout block variables — 2024 defaults; classic theme overrides below */
.phb-page.theme-onednd2024, .phb-page.theme-phb2014 {
  --sc-callout-note-bg: var(--sc-callout-bg);
  --sc-callout-note-border: var(--sc-callout-border);
  --sc-callout-desc-bg: color-mix(in srgb, var(--sc-accent) 12%, var(--sc-page-bg));
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-quote-color: var(--sc-ink);
  --sc-callout-attr-color: color-mix(in srgb, var(--sc-accent) 80%, var(--sc-ink));
}
.phb-page.theme-phb2014 {
  --sc-callout-note-bg: #E0E5C1;
  --sc-callout-note-border: var(--sc-accent);
  --sc-callout-desc-bg: #DDD8C4;
  --sc-callout-desc-border: var(--sc-accent);
  --sc-callout-attr-color: var(--sc-accent);
}
/* Note block */
.sc-note { background:var(--sc-callout-note-bg); border-left:3px solid var(--sc-callout-note-border); border-radius:0 4px 4px 0; padding:9px 14px; margin:14px 0; }
.sc-note p { margin:0 0 6px; font-size:0.875em; }
.sc-note p:last-child { margin-bottom:0; }
.theme-phb2014 .sc-note { border-left:none; border-top:2px double var(--sc-callout-note-border); border-bottom:2px double var(--sc-callout-note-border); border-radius:0; padding:8px 14px; }
/* Descriptive block */
.sc-descriptive { background:var(--sc-callout-desc-bg); border:2px solid var(--sc-callout-desc-border); border-radius:4px; padding:14px 16px; margin:14px 0; font-style:italic; }
.sc-descriptive p { margin:0 0 8px; }
.sc-descriptive p:last-child { margin-bottom:0; }
.theme-phb2014 .sc-descriptive { border-radius:0; border-width:3px; }
/* Quote block */
.sc-quote { padding:6px 16px; margin:14px 0; color:var(--sc-callout-quote-color); font-style:italic; }
.sc-quote p { margin:0 0 5px; }
.sc-quote p:last-child { margin-bottom:0; }
/* Attribution — em-dash via pseudo-element; no content = no orphaned dash */
.sc-attribution { font-style:normal; font-variant:small-caps; font-size:0.875em; color:var(--sc-callout-attr-color); margin:6px 0 0; letter-spacing:.02em; }
.sc-attribution::before { content:"\\2014\\00A0"; }
`;

function themeClass(theme: ScriptoriumTheme): string {
  return theme === "phb2014" ? "theme-phb2014" : "theme-onednd2024";
}

async function buildPdfBlob(
  pages: string[],
  title: string,
  theme: ScriptoriumTheme,
  pageSize: ScriptoriumPageSize = "A4",
  inkFriendly = false,
  pageFooters: (string | null)[] = [],
  footerText = "",
): Promise<Blob> {
  const size = PAGE_SIZES[pageSize];
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${size.w}px;`;
  // Inject page dimensions as CSS variables on the holder
  holder.style.setProperty("--sc-page-w", `${size.w}px`);
  holder.style.setProperty("--sc-page-h", `${size.h}px`);
  const styleEl = document.createElement("style");
  styleEl.textContent = RENDER_CSS + FOOTER_CSS;
  holder.appendChild(styleEl);

  const cls = themeClass(theme);
  const inkCls = inkFriendly ? " ink-friendly" : "";
  const pageEls: HTMLElement[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = document.createElement("div");
    page.className = `phb-page ${cls}${inkCls}`;

    const border = document.createElement("img");
    border.className = "phb-border";
    border.src = "/assets/scriptorium/page-border.png";
    border.alt = "";
    page.appendChild(border);

    if (i === 0) {
      const bar = document.createElement("div");
      bar.className = "phb-title-bar";
      bar.textContent = title || "Untitled Document";
      page.appendChild(bar);
    }

    const body = document.createElement("div");
    body.innerHTML = pages[i];
    page.appendChild(body);

    // Footer bar: inject if this page has a page number label
    const footerLabel = pageFooters[i] ?? null;
    if (footerLabel !== null) {
      const footer = document.createElement("div");
      footer.className = "sc-footer";
      const textSpan = document.createElement("span");
      textSpan.className = "sc-footer-text";
      textSpan.textContent = footerText;
      const numSpan = document.createElement("span");
      numSpan.className = "sc-footer-num";
      numSpan.textContent = footerLabel;
      footer.appendChild(textSpan);
      footer.appendChild(numSpan);
      page.appendChild(footer);
    }

    holder.appendChild(page);
    pageEls.push(page);
  }

  // Inject sc-page-{n} id anchors so TOC links resolve inside the PDF viewer
  const tocPageIdx = pages.findIndex((p) => p.includes('data-type="toc"'));
  injectPageAnchors(pageEls, tocPageIdx);

  document.body.appendChild(holder);
  await document.fonts.ready;
  await Promise.all(
    Array.from(holder.querySelectorAll<HTMLImageElement>("img")).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            img.onload = () => r();
            img.onerror = () => r();
          }),
    ),
  );

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: size.format });
  pdf.setProperties({ title: title || "Untitled Document" });
  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], {
      scale: 2,
      useCORS: true,
      logging: false,
      width: size.w,
      height: size.h,
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, size.mmW, size.mmH);
  }

  document.body.removeChild(holder);
  return pdf.output("blob") as Blob;
}

export function useScriptoriumPdf(
  pages: ComputedRef<string[]>,
  title: Ref<string>,
  theme: Ref<ScriptoriumTheme>,
  pageSize: Ref<ScriptoriumPageSize>,
  inkFriendly: Ref<boolean>,
  pageFooters: ComputedRef<(string | null)[]>,
  footerText: Ref<string>,
) {
  const showPdfPreview = ref(false);
  const pdfBlobUrl = ref<string | null>(null);
  const isGeneratingPdf = ref(false);

  function closePdfPreview() {
    showPdfPreview.value = false;
    if (pdfBlobUrl.value) {
      URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = null;
    }
  }

  function savePdf() {
    if (!pdfBlobUrl.value) return;
    const a = document.createElement("a");
    a.href = pdfBlobUrl.value;
    a.download = `${title.value || "Untitled"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  }

  async function exportPdf() {
    isGeneratingPdf.value = true;
    try {
      const blob = await buildPdfBlob(
        pages.value,
        title.value,
        theme.value,
        pageSize.value,
        inkFriendly.value,
        pageFooters.value,
        footerText.value,
      );
      const fileName = `${title.value || "Untitled"}.pdf`;
      // Use File instead of Blob — Chrome's PDF viewer uses the File name as the suggested download filename
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = URL.createObjectURL(file);
      showPdfPreview.value = true;
    } finally {
      isGeneratingPdf.value = false;
    }
  }

  onUnmounted(() => {
    if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value);
  });

  return { showPdfPreview, pdfBlobUrl, isGeneratingPdf, exportPdf, savePdf, closePdfPreview };
}
