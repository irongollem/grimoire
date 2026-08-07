<template>
  <AppSelect v-model="model" size="md" :aria-label="ariaLabel" class="shrink-0">
    <slot />
  </AppSelect>
</template>

<script setup lang="ts">
/**
 * The picker used in list-page filter rows (#561).
 *
 * A thin wrapper over AppSelect, not a second copy of its chrome: it names the
 * filter-row size (`md` — the compact desktop look plus a ≥44px tap target on
 * touch) and pins `shrink-0` so a filter never collapses when the row runs out of
 * width. Border, radius, focus ring, typography and the `appearance` caret all
 * still come from AppSelect and the base rule in main.css.
 *
 * Options come through the default slot so the caller keeps control of the
 * placeholder value ("" vs "all") and the ordering.
 */
import AppSelect from "./AppSelect.vue";

const model = defineModel<string>({ required: true });
defineProps<{
  ariaLabel?: string;
}>();
</script>
