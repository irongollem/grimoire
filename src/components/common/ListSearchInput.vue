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
    <AppInput
      v-no-pwm
      v-model="model"
      type="text"
      tone="card"
      size="body"
      :placeholder="placeholder"
      class="pl-8 min-h-11 md:min-h-0"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconSearch } from '@/lib/icons';
import AppInput from "@/components/common/AppInput.vue";

const model = defineModel<string>({ required: true });
const { inline = true, placeholder = "Search…" } = defineProps<{
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
