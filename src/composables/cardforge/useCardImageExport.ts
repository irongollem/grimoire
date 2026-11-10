import { ref } from "vue";
import { downloadBlob } from "@/lib/downloadBlob";
import { chunksArrived } from "@/lib/staleChunkRecovery";
import { useToast } from "@/composables/useToast";
import { applyClamps, measureClamps } from "@/lib/cardforge/lineClamp";
import {
  CARD_IMAGE_DPI,
  cardImageFilename,
  cardImageScale,
  type CardFace,
  type CardSize,
} from "@/lib/cardforge/cardImage";

export interface CardImageRequest {
  /** Which preview card is saving, so only its button shows progress. */
  key: string;
  /** The card face's root element, as drawn in the preview. */
  element: HTMLElement;
  size: CardSize;
  name: string;
  face: CardFace;
}

/**
 * Saves one Card Forge card face as a PNG at print size (#1141).
 *
 * html2canvas, which the character sheet uses, repaints the DOM itself and
 * cannot draw what the card designs are made of (`color-mix`, `clip-path`,
 * `mask-image` icons, `filter`); it throws on the first `color-mix`.
 * modern-screenshot instead serialises the card into an SVG `foreignObject`,
 * so the browser draws it exactly as on screen, and inlines the fonts the
 * card uses and every image it shows. Art comes from the CDN, which answers
 * every request with `Access-Control-Allow-Origin: *`, so inlining it never
 * taints the canvas.
 */
export function useCardImageExport() {
  const toast = useToast();
  /** The key of the card being saved, or null. One card at a time. */
  const savingKey = ref<string | null>(null);

  async function saveCardImage(req: CardImageRequest): Promise<void> {
    if (savingKey.value) return;
    savingKey.value = req.key;
    try {
      // Only needed once a DM actually saves a card, so it stays out of the
      // Card Forge chunk.
      const modules = [await import("modern-screenshot")] as const;
      if (!chunksArrived(modules)) return;
      const [{ createContext, destroyContext, domToBlob }] = modules;

      await document.fonts.ready;
      // A clamped box loses its "…" inside the foreignObject, so the cut text is
      // written into the drawn copy instead (lineClamp.ts).
      const clamps = measureClamps(req.element);
      try {
        const context = await createContext(req.element, {
          onCloneNode: (clone) => applyClamps(clone, clamps.keep),
          scale: cardImageScale(req.size, req.element.offsetWidth),
          style: {
            // The preview's drop shadow is chrome, not card.
            boxShadow: "none",
            // Inside a foreignObject, `overflow: hidden` on a rounded card does
            // not clip a transformed child (the focal-cropped portrait), so the
            // art filled the corners square. A clip-path clips every descendant.
            clipPath: `inset(0 round ${getComputedStyle(req.element).borderRadius})`,
          },
        });
        // The library records 96 dpi × scale (357 dpi here), which would print
        // the card at 53 mm instead of 63. Stamp the resolution it was made for.
        context.dpi = CARD_IMAGE_DPI;
        try {
          const blob = await domToBlob(context);
          downloadBlob(blob, cardImageFilename(req.name, req.face));
        } finally {
          destroyContext(context);
        }
      } finally {
        clamps.untag();
      }
    } catch (e) {
      toast.error(toast.fromError(e, "The card could not be saved as an image."));
    } finally {
      savingKey.value = null;
    }
  }

  return { savingKey, saveCardImage };
}
