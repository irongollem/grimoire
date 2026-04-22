import { ref, onUnmounted } from "vue";
import type { ComputedRef, Ref } from "vue";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";

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
/* Decoration variables — resolved via existing palette vars for both themes */
.phb-page.theme-onednd2024, .phb-page.theme-phb2014 { --sc-decoration-watermark:var(--sc-accent); --sc-decoration-credit:var(--sc-ink); }
/* Watercolor overlay: mix-blend-mode blends the splatter with the parchment */
img[data-type="watercolor"] { mix-blend-mode:multiply; }
/* Watermark wrapper fills the page (absolute via inline style from renderHTML) */
div[data-type="watermark"] { overflow:hidden; }
/* Artist credit positioned via inline style from renderHTML — no extra rules needed */
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
): Promise<Blob> {
  const size = PAGE_SIZES[pageSize];
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${size.w}px;`;
  // Inject page dimensions as CSS variables on the holder
  holder.style.setProperty("--sc-page-w", `${size.w}px`);
  holder.style.setProperty("--sc-page-h", `${size.h}px`);
  const styleEl = document.createElement("style");
  styleEl.textContent = RENDER_CSS;
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

    holder.appendChild(page);
    pageEls.push(page);
  }

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
      const blob = await buildPdfBlob(pages.value, title.value, theme.value, pageSize.value, inkFriendly.value);
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
