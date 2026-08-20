<template>
  <div class="flex items-center gap-0 border-b border-border" :class="wrapperClass">
    <button
      v-for="tab in tabs"
      :key="String(tab.id)"
      type="button"
      class="flex items-center gap-1.5 px-4 py-2 text-label-lg font-semibold border-b-2 -mb-px transition-colors shrink-0"
      :class="modelValue === tab.id
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'"
      @click="emit('update:modelValue', tab.id)"
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

export interface TabItem<T extends string | number> {
  id: T;
  label: string;
  icon?: AppIcon;
  count?: number;
  badge?: string | number;
}

defineProps<{
  tabs: ReadonlyArray<TabItem<T>>;
  modelValue: T;
  wrapperClass?: string;
}>();

const emit = defineEmits<{
  (e: 'update:modelValue', value: T): void;
}>();
</script>
