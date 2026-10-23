<script setup lang="ts">
/**
 * The page engine's window (#1085). One article is laid out in a fixed-size CSS multi-column box, a column to a
 * page, and this component shows page `k` of it: the same flowed content, shifted left by `k * pitch` behind a
 * clipped viewport. Two of these side by side are a spread; each reports how many columns the flow made, which is
 * how the reader learns an article's length.
 *
 * The flow is re-measured whenever it can have changed size: the window resizing, fonts arriving, an image loading
 * into a later column, or the article itself changing (the almanac steps months). Only layout is measured; the
 * text is real text in the DOM, so find-in-page, selection and screen readers see it.
 */
import { computed, onBeforeUnmount, onMounted, ref, useTemplateRef, watch } from "vue";
import type { BookModel } from "@/lib/openBook/bookModel";
import type { BookSection } from "@/lib/openBook/sections";
import { columnOffset, countColumns, pageOfOffset } from "@/lib/openBook/pagination";
import AlmanacPage from "./articles/AlmanacPage.vue";
import BookArticle from "./articles/BookArticle.vue";
import IndexPage from "./articles/IndexPage.vue";

const { model, section, k, assistive } = defineProps<{
  model: BookModel;
  section: BookSection;
  /** Which page of the flow this window shows. */
  k: number;
  /**
   * The copy a screen reader and the Tab key use. A spread draws the article twice, so one copy carries the text
   * for assistive technology and the other is hidden from it, its links out of the tab order.
   */
  assistive: boolean;
}>();

const emit = defineEmits<{
  measured: [count: number, layout: string];
  reveal: [page: number];
}>();

const viewport = useTemplateRef<HTMLElement>("viewport");
const flow = useTemplateRef<HTMLElement>("flow");
const size = ref({ width: 0, height: 0 });
const gap = ref(32);

const flowStyle = computed(() => {
  const { width, height } = size.value;
  return {
    width: `${width}px`,
    height: `${height}px`,
    columnWidth: `${width}px`,
    columnGap: `${gap.value}px`,
    transform: `translate3d(${-columnOffset(k, width, gap.value)}px, 0, 0)`,
    "--ob-page-h": `${height}px`,
    visibility: width > 0 ? ("visible" as const) : ("hidden" as const),
  };
});

let frame = 0;
let resizeObserver: ResizeObserver | null = null;
let mutationObserver: MutationObserver | null = null;

function readSize() {
  const el = viewport.value;
  if (!el) return;
  // Layout size, not the painted rectangle: a page on a leaf in mid-turn is rotated, and its painted box is not its size.
  const width = el.clientWidth;
  const height = el.clientHeight;
  if (width !== size.value.width || height !== size.value.height) size.value = { width, height };
  const rootSize = Number.parseFloat(getComputedStyle(document.documentElement).fontSize);
  gap.value = Math.round((Number.isFinite(rootSize) ? rootSize : 16) * 2);
}

function measure() {
  const el = flow.value;
  const { width, height } = size.value;
  if (!el || width <= 0 || height <= 0) return;
  emit("measured", countColumns(el.scrollWidth, width, gap.value), `${width}x${height}`);
}

/** The hidden copy must not be reachable by Tab: its links sit in columns the reader cannot see. */
function settleTabOrder() {
  const el = flow.value;
  if (!el || assistive) return;
  for (const node of el.querySelectorAll<HTMLElement>("a[href], button, input, select, textarea, [tabindex]")) {
    node.tabIndex = -1;
  }
}

function schedule() {
  if (frame) cancelAnimationFrame(frame);
  frame = requestAnimationFrame(() => {
    frame = 0;
    readSize();
    measure();
    settleTabOrder();
  });
}

function onFocusIn(event: FocusEvent) {
  const target = event.target;
  const el = flow.value;
  if (!(target instanceof HTMLElement) || !el) return;
  const { width } = size.value;
  const offset = target.getBoundingClientRect().left - el.getBoundingClientRect().left;
  const page = pageOfOffset(offset, width, gap.value, Number.MAX_SAFE_INTEGER);
  if (page !== k) emit("reveal", page);
}

onMounted(() => {
  readSize();
  schedule();
  if (typeof ResizeObserver !== "undefined" && viewport.value) {
    resizeObserver = new ResizeObserver(schedule);
    resizeObserver.observe(viewport.value);
  }
  if (typeof MutationObserver !== "undefined" && flow.value) {
    mutationObserver = new MutationObserver(schedule);
    mutationObserver.observe(flow.value, { childList: true, subtree: true, characterData: true });
  }
  flow.value?.addEventListener("load", schedule, true);
  void document.fonts?.ready.then(schedule);
});

onBeforeUnmount(() => {
  if (frame) cancelAnimationFrame(frame);
  resizeObserver?.disconnect();
  mutationObserver?.disconnect();
  flow.value?.removeEventListener("load", schedule, true);
});

watch(() => section.key, schedule);
watch(size, schedule);
</script>

<template>
  <div ref="viewport" class="ob-viewport" :aria-hidden="assistive ? undefined : 'true'">
    <div ref="flow" class="ob-flow" :style="flowStyle" @focusin="onFocusIn">
      <BookArticle v-if="section.kind === 'entry' && section.entry" :model="model" :entry="section.entry" />
      <AlmanacPage v-else-if="section.kind === 'almanac'" :model="model" />
      <IndexPage v-else-if="section.kind === 'index'" :model="model" />
    </div>
  </div>
</template>
