<template>
  <div
    ref="rootEl"
    class="tab-bar flex items-center gap-0 border-b border-border"
    role="tablist"
    :class="wrapperClass"
    :style="fadeStyle"
    @scroll.passive="measure"
  >
    <button
      v-for="(tab, i) in tabs"
      :key="String(tab.id)"
      type="button"
      role="tab"
      :aria-selected="modelValue === tab.id"
      :tabindex="modelValue === tab.id ? 0 : -1"
      :id="panelIdPrefix ? `${panelIdPrefix}-tab-${tab.id}` : undefined"
      :aria-controls="panelIdPrefix ? `${panelIdPrefix}-panel-${tab.id}` : undefined"
      class="flex items-center gap-1.5 px-4 py-2 text-label-lg font-semibold border-b-2 -mb-px transition-colors shrink-0"
      :class="modelValue === tab.id
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'"
      @click="emit('update:modelValue', tab.id)"
      @keydown="onKeydown($event, i)"
    >
      <component :is="tab.icon" v-if="tab.icon" class="h-3.5 w-3.5" />
      {{ tab.label }}
      <span
        v-if="typeof tab.count === 'number' && tab.count > 0"
        class="text-caption-sm font-normal opacity-70"
      >({{ tab.count }})</span>
      <EntityNewDot v-if="tab.dot" :is-new="true" size="sm" title="New" />
      <span
        v-if="tab.badge"
        class="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-caption-sm font-normal px-1.5"
      >{{ tab.badge }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import type { AppIcon } from '@/lib/icons';
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import EntityNewDot from '@/components/common/EntityNewDot.vue';
import { focusTab, nextTabIndex } from '@/lib/tabKeys';

export interface TabItem<T extends string | number> {
  id: T;
  label: string;
  icon?: AppIcon;
  count?: number;
  badge?: string | number;
  /** Something new inside this tab: a small dot after the label. */
  dot?: boolean;
}

const props = defineProps<{
  tabs: ReadonlyArray<TabItem<T>>;
  modelValue: T;
  wrapperClass?: string;
  /**
   * Optional: links each tab to its panel. Tabs get id `${prefix}-tab-${id}`
   * and aria-controls `${prefix}-panel-${id}`; give the panel that id,
   * role="tabpanel" and aria-labelledby the tab's id.
   */
  panelIdPrefix?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();

// Arrow keys / Home / End move between tabs (see tabKeys.ts); only the
// selected tab is in the Tab order, so Tab goes on to the panel.
function onKeydown(event: KeyboardEvent, current: number) {
  const next = nextTabIndex(event.key, current, props.tabs.length);
  if (next === null) return;
  event.preventDefault();
  emit('update:modelValue', props.tabs[next].id);
  focusTab(event.currentTarget, next);
}

// A tab row that scrolls sideways (a caller gives it overflow-x-auto) fades its
// clipped edges, so a phone shows there is more, and brings the selected tab
// into view. A row that fits, or one whose theme lets it overflow visibly,
// is left exactly as it was: a mask would also clip a hanging ribbon.
const rootEl = ref<HTMLElement | null>(null);
const fadeStart = ref(false);
const fadeEnd = ref(false);

function measure() {
  const el = rootEl.value;
  if (!el) return;
  const overflowX = getComputedStyle(el).overflowX;
  const scrolls = (overflowX === 'auto' || overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1;
  fadeStart.value = scrolls && el.scrollLeft > 1;
  fadeEnd.value = scrolls && el.scrollLeft + el.clientWidth < el.scrollWidth - 1;
}

const FADE = '1.5rem';
const fadeStyle = computed(() => {
  if (!fadeStart.value && !fadeEnd.value) return undefined;
  const mask = `linear-gradient(to right, ${fadeStart.value ? 'transparent' : 'black'}, black ${FADE}, black calc(100% - ${FADE}), ${fadeEnd.value ? 'transparent' : 'black'})`;
  return { maskImage: mask, WebkitMaskImage: mask };
});

function revealSelected() {
  const el = rootEl.value;
  const tab = el?.querySelector<HTMLElement>('[role="tab"][aria-selected="true"]');
  if (!el || !tab) return;
  // Position within the scrolled content; offsetLeft is relative to whichever ancestor is positioned.
  const left = tab.getBoundingClientRect().left - el.getBoundingClientRect().left + el.scrollLeft;
  const right = left + tab.getBoundingClientRect().width;
  // Leave room for the fade so the tab is not drawn half-transparent.
  const gutter = 24;
  if (left - gutter < el.scrollLeft) el.scrollLeft = Math.max(0, left - gutter);
  else if (right + gutter > el.scrollLeft + el.clientWidth) el.scrollLeft = right + gutter - el.clientWidth;
}

let observer: ResizeObserver | null = null;
onMounted(() => {
  void nextTick(() => {
    revealSelected();
    measure();
  });
  if (typeof ResizeObserver !== 'undefined' && rootEl.value) {
    observer = new ResizeObserver(measure);
    observer.observe(rootEl.value);
  }
});
onBeforeUnmount(() => observer?.disconnect());
watch(
  () => [props.modelValue, props.tabs.length],
  () => void nextTick(() => {
    revealSelected();
    measure();
  }),
);
</script>
