/*
 * The free plan's canvas count is read from what is saved in the book (`private.count_paint_canvases`), so the
 * quota may only be asked again once a save that added or removed a painting has landed. Asking when Done
 * or Flatten emits is too early: the write to the chapter or the page furniture comes later, and the answer
 * would still count the old state (#1181).
 */
import { useInvalidateQuota } from "@/composables/billing/useQuota";
import { paintMarkerCount } from "@/scriptorium/illuminator/lib/paintQuota";

/** Call after a save of a chapter's JSON (or of the furniture serialised) with the text before and after it. */
export function usePaintQuotaRefresh(): (before: string, after: string) => void {
  const invalidateQuota = useInvalidateQuota();
  return (before, after) => {
    if (paintMarkerCount(before) !== paintMarkerCount(after)) void invalidateQuota("paint_canvases");
  };
}
