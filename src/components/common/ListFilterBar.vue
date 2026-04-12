<template>
  <!--
    Standard filter-row container for list pages. Applies the responsive
    `flex flex-wrap gap-2` pattern and hooks up the Clear button.

    `min-w-max md:min-w-0` is the key responsive trick: on mobile the bar
    sizes to its content (so the parent's overflow-x-auto in
    ListPageLayout.#filters actually has something to scroll), on desktop it
    shrinks back into wrap mode.

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

    <div class="flex flex-wrap items-center gap-2 min-w-max md:min-w-0">
      <slot />

      <!--
        Clear is an X icon — on mobile it collapses to just the X (via
        ListActionButton's default `collapseOnMobile: true`), on desktop it
        shows "X Clear". Keeps the row tight on narrow screens where the
        "Clear" label doesn't fit alongside search + filters.
      -->
      <ListActionButton
        v-if="hasActiveFilters"
        :icon="X"
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
import { X } from "lucide-vue-next";
import ListActionButton from "@/components/common/ListActionButton.vue";

const props = withDefaults(
  defineProps<{
    /** Controls whether the Clear button renders in the bar. */
    hasActiveFilters?: boolean;
  }>(),
  {
    hasActiveFilters: false,
  },
);

const emit = defineEmits<{
  (e: "clear"): void;
}>();

const slots = useSlots();
const outerClass = computed(() =>
  slots.above ? "flex flex-col gap-2" : "",
);

// Surface `hasActiveFilters` for devtools discoverability.
void props;
</script>
