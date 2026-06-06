<template>
  <!--
    Standard filter-row container for list pages. Applies the responsive
    `flex flex-wrap gap-2` pattern and hooks up the Clear button.

    On mobile the bar has no min-width, so its `flex-wrap` children wrap onto
    multiple lines and no control is pushed off-screen. On desktop it keeps
    `md:min-w-0` — identical to the previous behaviour — so it shrinks/wraps the
    same way it always has within the static (non-scrolling) filter row.

    Multi-row layouts (e.g. search on top, filters below) compose two
    ListFilterBar instances inside a `flex flex-col gap-2` wrapper, or use
    the `above` slot for the search row.

    Clear button is automatic — pass `hasActiveFilters` + listen for
    `@clear`. Omit both if the view has no clearable state.
  -->
  <div :class="outerClass">
    <div v-if="$slots.above" class="w-full">
      <slot name="above" />
    </div>

    <div class="flex flex-wrap items-center gap-2 md:min-w-0">
      <slot />

      <!--
        Clear is an lose icon — on mobile it collapses to just the IconClose (via
        ListActionButton's default `collapseOnMobile: true`), on desktop it
        shows "Close Clear". Keeps the row tight on narrow screens where the
        "Clear" label doesn't fit alongside search + filters.
      -->
      <ListActionButton
        v-if="hasActiveFilters"
        :icon="IconClose"
        label="Clear"
        tooltip="Clear filters"
        variant="ghost"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";
import { IconClose } from "@/lib/icons";
import ListActionButton from "@/components/common/ListActionButton.vue";

defineProps<{
  /** Controls whether the Clear button renders in the bar. */
  hasActiveFilters?: boolean;
}>();

const emit = defineEmits<{
  (e: "clear"): void;
}>();

const slots = useSlots();
const outerClass = computed(() => (slots.above ? "flex flex-col gap-2" : ""));
</script>
