<template>
  <div class="tab-bar flex items-center gap-0 border-b border-border" role="tablist" :class="wrapperClass">
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
      <span
        v-if="tab.badge"
        class="inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-caption-sm font-normal px-1.5"
      >{{ tab.badge }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
import type { AppIcon } from '@/lib/icons';
import { focusTab, nextTabIndex } from '@/lib/tabKeys';

export interface TabItem<T extends string | number> {
  id: T;
  label: string;
  icon?: AppIcon;
  count?: number;
  badge?: string | number;
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
</script>
