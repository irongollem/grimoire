<template>
  <div ref="rootRef" class="relative w-full" :style="{ height: `${totalSize}px` }">
    <div
      v-for="vRow in virtualRows"
      :key="String(vRow.key)"
      :ref="measureRow"
      :data-index="vRow.index"
      class="absolute top-0 left-0 grid w-full"
      :style="{
        transform: `translateY(${vRow.start - scrollMargin}px)`,
        gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
        columnGap: `${gap}rem`,
      }"
    >
      <template v-for="(item, i) in rowItems(items, columns, vRow.index)" :key="itemKey(item)">
        <slot :item="item" :index="vRow.index * columns + i" />
      </template>
    </div>
  </div>
</template>

<script setup lang="ts" generic="T">
/**
 * A windowed list/grid. Only the rows near the viewport are mounted, so a list
 * of thousands holds a screenful of DOM, images and observers instead of all of
 * them. Rows (not items) are virtualized: items are chunked `columns` to a row
 * and each visible row is a CSS grid, so a wrapped card never straddles the
 * window edge.
 *
 * Why this exists: every card of the bestiary used to stay mounted, and each
 * held a decoded portrait; a thousand cards froze an iPhone.
 *
 * The scroller is never the window. From `lg` a list page scrolls inside
 * ListPageLayout's body and below it inside the layout's `<main>`, so the
 * scroll element is found with `scrollParentOf` and found again on resize
 * (the breakpoint crossing swaps it). The list does not start at the scroller's
 * top, with the page header and filters above it, so its offset in the scroller
 * goes to the virtualizer as `scrollMargin` and is re-read whenever anything
 * above changes height.
 *
 * The root is as tall as the whole list would be, so whatever follows it (the
 * server-paged lists' sentinel) still meets the viewport at the true end; rows
 * are absolutely placed inside it and only the visible ones exist.
 *
 * Row heights are an estimate until a row mounts and is measured, so a good
 * `estimateRowHeight` keeps the scrollbar and restored scroll positions close.
 *
 * Do not import this from anything on the boot path: the virtualizer lives in
 * its own chunk.
 */
import { computed, nextTick, onBeforeUnmount, onMounted, ref, shallowRef, watch } from "vue";
import { useVirtualizer } from "@tanstack/vue-virtual";
import { scrollParentOf } from "@/lib/scrollParent";
import { rowCount, rowItems } from "@/lib/gridLayout";

const {
  items,
  itemKey,
  columns,
  estimateRowHeight,
  gap = 0.75,
  overscan = 4,
} = defineProps<{
  items: T[];
  itemKey: (item: T) => string | number;
  /** Items per row. Use `useBreakpointColumns` / `useAutoFillColumns` to mirror a CSS grid. */
  columns: number;
  /** Row height in px before it is measured. */
  estimateRowHeight: number;
  /** rem, between rows and between columns. Default is the lists' `gap-3`. */
  gap?: number;
  /** Rows kept mounted beyond the viewport on each side. */
  overscan?: number;
}>();

defineSlots<{
  default(props: { item: T; index: number }): unknown;
}>();

const rootRef = ref<HTMLElement | null>(null);
const scrollEl = shallowRef<HTMLElement | null>(null);
const scrollMargin = ref(0);
const gapPx = ref(0);

const rows = computed(() => rowCount(items.length, columns));

const virtualizer = useVirtualizer(
  computed(() => {
    // Read here, not inside the closure, so finding the scroller (after mount,
    // once the element is in the document) changes these options. vue-virtual
    // only attaches its scroll listener when its options change, and its own
    // mount hook runs before ours, while there is no scroller yet: with the
    // read inside the closure the list rendered its first rows and then never
    // followed the scroll at all.
    const scroller = scrollEl.value;
    return {
      count: rows.value,
      getScrollElement: () => scroller,
      estimateSize: () => estimateRowHeight,
      gap: gapPx.value,
      overscan,
      scrollMargin: scrollMargin.value,
      // Keyed by the row's first item so a measured height follows its content
      // when rows are inserted above (a new page never reshuffles above, but a
      // filter change does).
      getItemKey: (index: number) => {
        const first = items[index * columns];
        return first === undefined ? `row-${index}` : itemKey(first);
      },
    };
  }),
);

const virtualRows = computed(() => virtualizer.value.getVirtualItems());
const totalSize = computed(() => virtualizer.value.getTotalSize());

function measureRow(el: unknown) {
  virtualizer.value.measureElement(el instanceof Element ? el : null);
}

// A different column count means different rows, whatever was measured is stale.
watch(() => columns, () => virtualizer.value.measure());

// ── Where the list sits inside its scroller ──────────────────────────────────

let resizeObserver: ResizeObserver | null = null;

function resolveScroller(root: HTMLElement): HTMLElement {
  return scrollParentOf(root) ?? (document.scrollingElement as HTMLElement | null) ?? document.documentElement;
}

function remeasure() {
  const root = rootRef.value;
  if (!root) return;

  gapPx.value = gap * parseFloat(getComputedStyle(document.documentElement).fontSize);

  const scroller = resolveScroller(root);
  if (scroller !== scrollEl.value) {
    scrollEl.value = scroller;
    observeChain(root, scroller);
  }
  // The document element's rect scrolls away with the page; every other
  // scroller's rect is the fixed frame its content moves inside.
  const isDocument = scroller === document.documentElement;
  const frameTop = isDocument ? 0 : scroller.getBoundingClientRect().top + scroller.clientTop;
  const margin = Math.round(root.getBoundingClientRect().top - frameTop + scroller.scrollTop);
  if (margin !== scrollMargin.value) scrollMargin.value = margin;
}

/**
 * Anything above the list changing height (a filter row wrapping, a header
 * hiding) changes the height of every ancestor up to the scroller, so those are
 * what get watched. The root itself is excluded: its height is ours.
 */
function observeChain(root: HTMLElement, scroller: HTMLElement) {
  resizeObserver?.disconnect();
  if (typeof ResizeObserver === "undefined") return;
  resizeObserver = new ResizeObserver(remeasure);
  resizeObserver.observe(scroller);
  for (let node = root.parentElement; node && node !== scroller; node = node.parentElement) {
    resizeObserver.observe(node);
  }
}

onMounted(() => {
  remeasure();
  // The breakpoint crossing swaps the scroller without necessarily resizing an observed box.
  window.addEventListener("resize", remeasure);
  void nextTick(remeasure);
});
onBeforeUnmount(() => {
  window.removeEventListener("resize", remeasure);
  resizeObserver?.disconnect();
});
</script>
