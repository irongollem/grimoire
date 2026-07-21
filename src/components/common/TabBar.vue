<template>
  <div class="flex items-center gap-0 border-b border-border" :class="wrapperClass">
    <button
      v-for="tab in tabs"
      :key="String(tab.id)"
      type="button"
      class="px-4 py-2 text-label-lg font-semibold border-b-2 -mb-px transition-colors"
      :class="modelValue === tab.id
        ? 'border-primary text-primary'
        : 'border-transparent text-muted-foreground hover:text-foreground'"
      @click="emit('update:modelValue', tab.id)"
    >
      {{ tab.label }}
      <span
        v-if="typeof tab.count === 'number' && tab.count > 0"
        class="ml-1.5 text-caption-sm font-normal md:text-sm opacity-70"
      >({{ tab.count }})</span>
      <span
        v-if="tab.badge"
        class="ml-1.5 inline-flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-caption-sm font-normal px-1.5"
      >{{ tab.badge }}</span>
    </button>
  </div>
</template>

<script setup lang="ts" generic="T extends string | number">
export interface TabItem<T extends string | number> {
  id: T;
  label: string;
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
