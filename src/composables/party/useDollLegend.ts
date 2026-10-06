import { onBeforeUnmount, onMounted, ref, type Ref } from "vue";
import { legendLine, type LegendLine } from "@/lib/paperDoll/legendLine";
import type { SlotAnchorKey } from "@/lib/paperDoll/slotAnchors";

export interface MeasuredLegendLine extends LegendLine {
  slot: SlotAnchorKey;
}

type Anchors = Record<SlotAnchorKey, { x: number; y: number }>;

function box(el: Element) {
  const r = el.getBoundingClientRect();
  return { left: r.left, top: r.top, width: r.width, height: r.height };
}

/**
 * Measures the wells and the figure inside `container` (marked with
 * `data-doll-slot` + `data-doll-side`, and `data-doll-figure`) and returns one
 * hairline per well, in the container's coordinates. Re-measured whenever the
 * container resizes; call `measure()` after anything that moves a well.
 */
export function useDollLegend(container: Ref<HTMLElement | null>, anchors: () => Anchors | null) {
  const lines = ref<MeasuredLegendLine[]>([]);
  const size = ref({ width: 0, height: 0 });
  let observer: ResizeObserver | null = null;

  function measure() {
    const root = container.value;
    const at = anchors();
    const figure = root?.querySelector("[data-doll-figure]");
    if (!root || !at || !figure) {
      lines.value = [];
      return;
    }
    const containerBox = box(root);
    const figureBox = box(figure);
    size.value = { width: containerBox.width, height: containerBox.height };
    const next: MeasuredLegendLine[] = [];
    for (const el of root.querySelectorAll<HTMLElement>("[data-doll-slot]")) {
      const slot = el.dataset.dollSlot as SlotAnchorKey;
      if (!(slot in at)) continue;
      const side = el.dataset.dollSide === "right" ? "right" : "left";
      next.push({
        slot,
        ...legendLine({ well: box(el), container: containerBox, figure: figureBox, anchor: at[slot], side }),
      });
    }
    lines.value = next;
  }

  onMounted(() => {
    measure();
    if (typeof ResizeObserver === "undefined" || !container.value) return;
    observer = new ResizeObserver(measure);
    observer.observe(container.value);
    // The figure's picture and the wells' names can change size without the
    // row doing so (a sheet finishing loading, a long item name wrapping).
    for (const el of container.value.querySelectorAll<HTMLElement>("[data-doll-figure], [data-doll-slot]")) {
      observer.observe(el);
    }
  });
  onBeforeUnmount(() => observer?.disconnect());

  return { lines, size, measure };
}
