import { ref, createApp, nextTick, type Component } from "vue";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";
import IllustratedSheetDocument from "@/components/character-sheet/illustrated/IllustratedSheetDocument.vue";
import type { IllustratedTheme } from "@/components/character-sheet/illustrated/sheetTypes";

export type SheetPageSize = "A4" | "Letter";

/** Two distinct export styles: the CSS-themed "clean" sheets, and the fully
 *  illustrated baked-plate sheets (front + back). */
export type SheetMode = "clean" | "illustrated";

/** Visual theme applied to the rendered "clean" sheet. Each theme is a pure CSS
 *  class — the renderer adds `theme-<id>` to `.cs-page` and character-sheet.css
 *  handles variable overrides. "default" applies no extra class. */
export type SheetTheme = "default" | "horror" | "fairy" | "adventure" | "sumie";

export const SHEET_THEMES: { id: SheetTheme; label: string }[] = [
  { id: "default",   label: "Default" },
  { id: "horror",    label: "Horror" },
  { id: "fairy",     label: "Fairy & Whimsey" },
  { id: "adventure", label: "Adventure" },
  { id: "sumie",     label: "Sumi-e" },
];

export type { IllustratedTheme };

/** Themes for the illustrated mode — one baked plate set per id. */
export const ILLUSTRATED_THEMES: { id: IllustratedTheme; label: string }[] = [
  { id: "classic",   label: "Classic" },
  { id: "adventure", label: "Adventure" },
  { id: "gothic",    label: "Gothic" },
  { id: "fairy",     label: "Fairy" },
  { id: "sumie",     label: "Sumi-e" },
];

export interface SheetExportOptions {
  pageSize?: SheetPageSize;
  mode?: SheetMode;
  /** Clean-mode CSS theme. */
  theme?: SheetTheme;
  /** Illustrated-mode plate theme. */
  illustratedTheme?: IllustratedTheme;
  speciesName?: string | null;
  backgroundName?: string | null;
  /** AC bonus from equipped shields — computed by the caller via useShieldAcBonus(). */
  acBonus?: number;
}

const PAGE_DIMS_PX: Record<SheetPageSize, { w: number; h: number }> = {
  A4:     { w: 794, h: 1123 },
  Letter: { w: 816, h: 1056 },
};

const PAGE_DIMS_MM: Record<SheetPageSize, { w: number; h: number; format: string }> = {
  A4:     { w: 210, h: 297, format: "a4" },
  Letter: { w: 216, h: 279, format: "letter" },
};

export function useCharacterSheetPdf() {
  const isGenerating = ref(false);

  async function exportPdf(
    member: PartyMember,
    inventory: PartyInventoryItem[],
    {
      pageSize = "A4",
      mode = "clean",
      theme = "default",
      illustratedTheme = "classic",
      speciesName = null,
      backgroundName = null,
      acBonus = 0,
    }: SheetExportOptions = {},
  ): Promise<void> {
    isGenerating.value = true;

    const { w: pxW, h: pxH } = PAGE_DIMS_PX[pageSize];
    const { w: mmW, h: mmH, format } = PAGE_DIMS_MM[pageSize];

    // Create an off-screen container at exact page dimensions
    const container = document.createElement("div");
    container.style.cssText =
      `position:fixed;top:-9999px;left:-9999px;width:${pxW}px;overflow:hidden;z-index:-1;`;
    document.body.appendChild(container);

    // Both renderers emit one `.cs-page` element per printed page, so the capture
    // loop below is identical regardless of mode. Each takes its own `theme`
    // vocabulary, so resolve the right component + theme prop up front.
    const root: Component = mode === "illustrated" ? IllustratedSheetDocument : CharacterSheetRenderer;
    const app = createApp(root, {
      member,
      inventory,
      pageSize,
      theme: mode === "illustrated" ? illustratedTheme : theme,
      speciesName,
      backgroundName,
      acBonus,
    });
    app.mount(container);

    try {
      await nextTick();
      await document.fonts.ready;

      const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format });
      const pages = container.querySelectorAll<HTMLElement>(".cs-page");

      for (let i = 0; i < pages.length; i++) {
        const canvas = await html2canvas(pages[i] as HTMLElement, {
          scale: 2,
          useCORS: true,
          allowTaint: false,
          width: pxW,
          height: pxH,
          windowWidth: pxW,
          windowHeight: pxH,
        });
        const imgData = canvas.toDataURL("image/jpeg", 0.92);
        if (i > 0) pdf.addPage(format as string);
        pdf.addImage(imgData, "JPEG", 0, 0, mmW, mmH);
      }

      const filename = `${member.name.replace(/\s+/g, "_")}_character_sheet.pdf`;
      pdf.save(filename);
    } finally {
      app.unmount();
      document.body.removeChild(container);
      isGenerating.value = false;
    }
  }

  return { isGenerating, exportPdf };
}
