import { nextTick, watch } from "vue";
import { useRoute } from "vue-router";
import { prefersReducedMotion } from "@/lib/motion";
import { scrollWithin } from "@/lib/scrollParent";

/**
 * A chapter whose open record is local state (a people, a habitat, a table line) still has to land on the one a search
 * hit names: `/canon/peoples?people=<id>`. Reads `?<param>=` and, once the record is on screen (the list may still be
 * loading), calls `open` with its id and centres its row `rowId(id)` in its own scroller (a null `rowId` leaves the scrolling to whatever `open` shows). An id that matches nothing
 * opens nothing. Each id lands once, so closing the record afterwards is not undone by the next re-render of the list.
 */
export function useLinkedRow(param: string, exists: (id: string) => boolean, open: (id: string) => void, rowId: ((id: string) => string) | null): void {
  const route = useRoute();
  let landed: string | null = null;
  watch(
    () => {
      const raw = route.query[param];
      return typeof raw === "string" && exists(raw) ? raw : null;
    },
    async (id) => {
      if (id === null || id === landed) return;
      landed = id;
      open(id);
      if (rowId === null) return;
      await nextTick();
      const row = document.getElementById(rowId(id));
      if (row) scrollWithin(row, { block: "center", smooth: !prefersReducedMotion() });
    },
    { immediate: true },
  );
}
