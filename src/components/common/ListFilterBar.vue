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

    <!--
      A bar whose only control is the `above` search (the Reliquary sidebars)
      has nothing in this row until Clear appears. Rendering it anyway would
      leave the wrapper's `gap-2` as dead space under the search, so skip it.
    -->
    <div v-if="$slots.default || hasActiveFilters" class="flex flex-wrap items-center gap-2 md:min-w-0">
      <slot />

      <!--
        On mobile Clear collapses to just the IconClose, on desktop it shows the
        label too. Keeps the row tight on narrow screens where "Clear" doesn't fit
        alongside search + filters.
      -->
      <ListActionButton
        v-if="hasActiveFilters"
        :icon="IconClose"
        label="Clear"
        tooltip="Clear filters"
        variant="subtle"
        @click="emit('clear')"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, useSlots } from "vue";
import ListActionButton from "@/components/common/ListActionButton.vue";
import { IconClose } from "@/lib/icons";

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
