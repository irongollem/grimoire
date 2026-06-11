import { ref, onUnmounted } from "vue";
import type { ComputedRef, Ref } from "vue";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { ScriptoriumTheme, ScriptoriumPageSize } from "@/types/scriptorium.types";
import { injectPageAnchors } from "@/lib/tiptap/tocBlock";
import { EDITOR_PAGE_DIMENSIONS_PX } from "@/lib/scriptorium/editorConstants";
import themeBaseCss from "@/assets/scriptorium/theme-base.css?inline";
import themeOnednd2024Css from "@/assets/scriptorium/theme-onednd2024.css?inline";
import themePhb2014Css from "@/assets/scriptorium/theme-phb2014.css?inline";

/*
 * Physical page dimensions in mm + jsPDF format strings.
 *
 * Calibrated to `EDITOR_PAGE_DIMENSIONS_PX` at 96 dpi: jsPDF receives mm,
 * html2canvas reads the matching px dimensions from `EDITOR_PAGE_DIMENSIONS_PX`.
 * Keep both tables in sync when changing page sizes.
 */
const PDF_PAGE_DIMENSIONS_MM: Record<
  ScriptoriumPageSize,
  { mmW: number; mmH: number; format: string }
> = {
  A4:     { mmW: 210, mmH: 297, format: "a4" },
  A5:     { mmW: 148, mmH: 210, format: "a5" },
  Letter: { mmW: 216, mmH: 279, format: "letter" },
} as const;

/*
 * PDF-only rules layered on top of the shared theme CSS (src/assets/scriptorium/),
 * which is the single source of truth for the book look — preview, galley, and
 * this export all consume the same files. Only export-pipeline specifics live
 * here: explicit page sizing for html2canvas.
 */
const PDF_ONLY_CSS = `
* { box-sizing: border-box; }
.phb-page {
  width: var(--sc-page-w, 794px);
  height: var(--sc-page-h, 1123px);
  box-shadow: none;
}
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
  isTwoColumn = false,
): Promise<{ blob: Blob; brokenImages: string[] }> {
  const px = EDITOR_PAGE_DIMENSIONS_PX[pageSize];
  const mm = PDF_PAGE_DIMENSIONS_MM[pageSize];
  const holder = document.createElement("div");
  holder.style.cssText = `position:fixed;top:-9999px;left:-9999px;width:${px.w}px;`;
  holder.style.setProperty("--sc-page-w", `${px.w}px`);
  holder.style.setProperty("--sc-page-h", `${px.h}px`);
  const styleEl = document.createElement("style");
  const themeCss = theme === "phb2014" ? themePhb2014Css : themeOnednd2024Css;
  styleEl.textContent = themeBaseCss + themeCss + PDF_ONLY_CSS;
  holder.appendChild(styleEl);

  // Preload background texture so html2canvas can render the CSS background-image.
  // The existing img-wait loop below will block until this resolves.
  if (!inkFriendly) {
    const bgPreload = document.createElement("img");
    bgPreload.src = "/assets/scriptorium/page-background.webp";
    bgPreload.style.cssText = "position:absolute;width:0;height:0;opacity:0;pointer-events:none;";
    holder.appendChild(bgPreload);
  }

  const cls = themeClass(theme);
  const inkCls = inkFriendly ? " ink-friendly" : "";
  const pageEls: HTMLElement[] = [];
  for (let i = 0; i < pages.length; i++) {
    const page = document.createElement("div");
    page.className = `phb-page ${cls}${inkCls}`;

    const body = document.createElement("div");
    body.className = `phb-body sc-theme${isTwoColumn ? " phb-two-col" : ""}`;
    body.innerHTML = pages[i];
    page.appendChild(body);

    // Footer bar: inject if this page has a page number label.
    // Recto (even index = right-hand page): number on right.
    // Verso (odd index = left-hand page): number on left.
    const footerLabel = pageFooters[i] ?? null;
    if (footerLabel !== null) {
      const isRecto = i % 2 === 0;
      const footer = document.createElement("div");
      footer.className = "sc-footer";

      const numLeft = document.createElement("span");
      numLeft.className = "sc-footer-num";
      numLeft.textContent = footerLabel;
      numLeft.style.visibility = isRecto ? "hidden" : "visible";

      const textSpan = document.createElement("span");
      textSpan.className = "sc-footer-text";
      textSpan.textContent = footerText;

      const numRight = document.createElement("span");
      numRight.className = "sc-footer-num";
      numRight.textContent = footerLabel;
      numRight.style.visibility = isRecto ? "visible" : "hidden";

      footer.appendChild(numLeft);
      footer.appendChild(textSpan);
      footer.appendChild(numRight);
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
  const brokenImages: string[] = [];
  await Promise.all(
    Array.from(holder.querySelectorAll<HTMLImageElement>("img")).map((img) =>
      img.complete
        ? Promise.resolve()
        : new Promise<void>((r) => {
            img.onload = () => r();
            img.onerror = () => {
              if (img.src) brokenImages.push(img.src);
              r();
            };
          }),
    ),
  );

  const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: mm.format });
  pdf.setProperties({ title: title || "Untitled Document" });
  for (let i = 0; i < pageEls.length; i++) {
    const canvas = await html2canvas(pageEls[i], {
      scale: 2,
      useCORS: true,
      logging: false,
      width: px.w,
      height: px.h,
    });
    if (i > 0) pdf.addPage();
    pdf.addImage(canvas.toDataURL("image/jpeg", 0.92), "JPEG", 0, 0, mm.mmW, mm.mmH);
  }

  document.body.removeChild(holder);
  return { blob: pdf.output("blob") as Blob, brokenImages };
}

export function useScriptoriumPdf(
  pages: ComputedRef<string[]>,
  title: Ref<string>,
  theme: Ref<ScriptoriumTheme>,
  pageSize: Ref<ScriptoriumPageSize>,
  inkFriendly: Ref<boolean>,
  pageFooters: ComputedRef<(string | null)[]>,
  footerText: Ref<string>,
  isTwoColumn: Ref<boolean>,
) {
  const showPdfPreview = ref(false);
  const pdfBlobUrl = ref<string | null>(null);
  const isGeneratingPdf = ref(false);
  const pdfBrokenImages = ref<string[]>([]);

  function closePdfPreview() {
    showPdfPreview.value = false;
    pdfBrokenImages.value = [];
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
      const { blob, brokenImages } = await buildPdfBlob(
        pages.value,
        title.value,
        theme.value,
        pageSize.value,
        inkFriendly.value,
        pageFooters.value,
        footerText.value,
        isTwoColumn.value,
      );
      const fileName = `${title.value || "Untitled"}.pdf`;
      // Use File instead of Blob — Chrome's PDF viewer uses the File name as the suggested download filename
      const file = new File([blob], fileName, { type: "application/pdf" });
      if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value);
      pdfBlobUrl.value = URL.createObjectURL(file);
      pdfBrokenImages.value = brokenImages;
      showPdfPreview.value = true;
    } finally {
      isGeneratingPdf.value = false;
    }
  }

  onUnmounted(() => {
    if (pdfBlobUrl.value) URL.revokeObjectURL(pdfBlobUrl.value);
  });

  return { showPdfPreview, pdfBlobUrl, isGeneratingPdf, pdfBrokenImages, exportPdf, savePdf, closePdfPreview };
}
