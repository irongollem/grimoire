<template>
  <!--
    IconSearch input for list-page filter bars. Every list view had its own copy
    of this markup (icon + rounded border + bg-card + focus ring + min-w-48
    for inline flex layouts).

    Two sizing modes:
    - Inline (default): full-width on mobile (so it claims its own row and is a
      comfortable tap target), then `flex-1 min-w-48` from md up — identical to
      the previous desktop behaviour (grows to fill the filter row, shrinks to a
      sensible minimum before wrapping).
    - Block (`:inline="false"`): `w-full` for multi-row filter layouts where
      the search lives on its own row above the rest of the filters.
  -->
  <div :class="wrapperClass">
    <IconSearch
      class="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground pointer-events-none"
    />
    <input
      v-no-pwm
      v-model="model"
      type="text"
      :placeholder="placeholder"
      class="w-full bg-card border border-border rounded-md pl-8 pr-3 min-h-11 py-1.5 md:min-h-0 md:py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconSearch } from '@/lib/icons';

const model = defineModel<string>({ required: true });
const { inline = true, placeholder = "IconSearch…" } = defineProps<{
  placeholder?: string;
  /**
   * When `true` (default) the input is full-width on mobile and grows to fill
   * its flex parent down to a 12rem minimum from md up, matching the existing
   * inline filter-bar pattern. Set to `false` when the search lives on its own
   * row.
   */
  inline?: boolean;
}>();

const wrapperClass = computed(() =>
  inline
    ? "relative w-full md:w-auto md:flex-1 md:min-w-48"
    : "relative w-full",
);
</script>
