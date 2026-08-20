<template>
  <div class="rounded-lg border border-border bg-card overflow-hidden transition-shadow hover:shadow-sm">
    <div class="h-0.5 w-full" :style="{ backgroundColor: color }" />
    <button
      type="button"
      class="w-full flex items-start gap-3 px-4 py-3 text-left"
      @click="$emit('toggle')"
    >
      <component :is="icon" class="h-4 w-4 shrink-0 mt-0.5" :style="{ color }" />
      <div class="flex-1 min-w-0">
        <div class="flex items-baseline gap-2 flex-wrap">
          <p class="font-cinzel text-sm font-semibold text-foreground truncate">{{ title }}</p>
          <span class="text-label shrink-0" :style="{ color }">{{ categoryLabel }}</span>
        </div>
        <div v-if="preview" class="text-caption text-muted-foreground mt-0.5 line-clamp-1">{{ preview }}</div>
        <div class="flex flex-wrap items-center gap-3 mt-1.5">
          <span class="text-label text-muted-foreground/60">{{ date }}</span>
          <slot name="meta" />
        </div>
      </div>
      <IconChevronDown
        class="h-4 w-4 text-muted-foreground shrink-0 transition-transform mt-0.5"
        :class="expanded ? 'rotate-180' : ''"
      />
    </button>
    <div v-if="expanded" class="border-t border-border">
      <slot />
    </div>
  </div>
</template>

<script setup lang="ts">
import { IconChevronDown } from '@/lib/icons';
import type { Component } from "vue";

const { color, icon, categoryLabel, title, preview, date, expanded } = defineProps<{
  color: string;
  icon: Component;
  categoryLabel: string;
  title: string;
  preview?: string;
  date: string;
  expanded: boolean;
}>();

defineEmits<{ toggle: [] }>();
</script>
