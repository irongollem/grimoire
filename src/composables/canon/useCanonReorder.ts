import { useUpdateCanonEntry } from "@/composables/canon/useCanonEntries";
import { moveToEnd, moveWithin, type Ordered } from "@/lib/canon/canonOrder";

/**
 * Move one entry a step, or to the top or bottom, within the list on screen; only the rows whose place changed are written. A failed write has
 * already been toasted by the update mutation, and the list keeps the order the server still has.
 */
export function useCanonReorder() {
  const { mutateAsync } = useUpdateCanonEntry();
  return async (list: readonly Ordered[], id: string, direction: -1 | 1 | "top" | "bottom"): Promise<void> => {
    try {
      await Promise.all((typeof direction === "number" ? moveWithin(list, id, direction) : moveToEnd(list, id, direction)).map((w) => mutateAsync({ id: w.id, patch: { sort_order: w.sort_order } })));
    } catch {
      // The mutation has already told the DM (toast).
    }
  };
}
