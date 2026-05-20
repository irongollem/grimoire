import { ref, createApp, nextTick } from "vue";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import type { PartyMember } from "@/types/party.types";
import type { PartyInventoryItem } from "@/types/inventory.types";
import CharacterSheetRenderer from "@/components/character-sheet/CharacterSheetRenderer.vue";

export type SheetPageSize = "A4" | "Letter";

export interface SheetExportOptions {
  pageSize?: SheetPageSize;
  speciesName?: string | null;
  backgroundName?: string | null;
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
    { pageSize = "A4", speciesName = null, backgroundName = null }: SheetExportOptions = {},
  ): Promise<void> {
    isGenerating.value = true;

    const { w: pxW, h: pxH } = PAGE_DIMS_PX[pageSize];
    const { w: mmW, h: mmH, format } = PAGE_DIMS_MM[pageSize];

    // Create an off-screen container at exact page dimensions
    const container = document.createElement("div");
    container.style.cssText =
      `position:fixed;top:-9999px;left:-9999px;width:${pxW}px;overflow:hidden;z-index:-1;`;
    document.body.appendChild(container);

    const app = createApp(CharacterSheetRenderer, {
      member,
      inventory,
      pageSize,
      speciesName,
      backgroundName,
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
