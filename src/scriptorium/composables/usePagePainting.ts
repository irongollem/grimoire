/*
 * Paint on this page (#1181): one click makes a transparent page-sized picture behind the text and opens the
 * Illuminator on it with the Brush armed. The free plan's one painting canvas is asked first, because a page
 * painting counts as a canvas the moment it is saved, exactly as Blank sheet does.
 */
import { ref } from "vue";
import { useQuota } from "@/composables/billing/useQuota";
import { useToast } from "@/composables/useToast";
import { isQuotaExceeded } from "@/lib/quotaError";
import { reportHandledError } from "@/lib/observability/sentry";
import { hashSettings } from "@/scriptorium/illuminator/lib/treatment";
import { PAGE_PAINTING_PLACEMENT, pagePaintingPaper, pagePaintingProps, pagePaintingRecipe, pagePaintingSize } from "@/scriptorium/lib/panel/pagePainting";
import { uploadTransparentSheet } from "@/scriptorium/lib/panel/newSheetUpload";
import type { PictureActions } from "@/scriptorium/composables/useEditorPictures";
import type { PaperId } from "@/scriptorium/papers/papers";
import type { PageFurnitureItem, ScriptoriumTheme } from "@/scriptorium/types";
import { useAuthStore } from "@/stores/auth";

interface Options {
  pictures: () => Pick<PictureActions, "addArt">;
  pageAspect: () => number;
  paperTone: () => PaperId | null;
  theme: () => ScriptoriumTheme | null;
  /** Open the Illuminator on the new item (it has not reached the selection or the furniture list yet). */
  open: (item: PageFurnitureItem) => void;
}

export function usePagePainting(opts: Options) {
  const auth = useAuthStore();
  const toast = useToast();
  const { canCreate } = useQuota("paint_canvases");
  const busy = ref(false);
  const showPaywall = ref(false);

  async function start() {
    if (busy.value) return;
    if (!canCreate.value) {
      showPaywall.value = true;
      return;
    }
    const userId = auth.user?.id;
    if (!userId) return;
    busy.value = true;
    try {
      const size = pagePaintingSize(opts.pageAspect());
      const paper = pagePaintingPaper(opts.paperTone(), opts.theme());
      const url = await uploadTransparentSheet(size, userId);
      const recipe = pagePaintingRecipe(paper, size, Math.floor(Math.random() * 2 ** 31));
      const item = opts.pictures().addArt(url, pagePaintingProps(url, recipe, hashSettings(recipe)), PAGE_PAINTING_PLACEMENT);
      if (item) opts.open(item);
    } catch (err) {
      if (isQuotaExceeded(err)) showPaywall.value = true;
      else {
        reportHandledError(err, "scriptorium:page-painting");
        toast.error(err instanceof Error ? err.message : "Could not start the painting.");
      }
    } finally {
      busy.value = false;
    }
  }

  return { start, busy, showPaywall };
}
