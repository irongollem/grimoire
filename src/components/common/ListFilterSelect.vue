<template>
  <AppSelect
    v-model="model"
    size="md"
    :aria-label="ariaLabel"
    class="max-w-full shrink-0 max-md:min-w-0 max-md:grow max-md:basis-[calc(50%-0.25rem)]"
  >
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
 * width, with `max-w-full` so it never grows past the row either: a native select
 * is as wide as its longest option, and on iOS (where `base.css` forces 16px on
 * selects to stop focus-zoom) the Vault's "System Reference Document 5.1" source
 * pushed the whole page wider than the phone.
 *
 * Below md the filter row is a two-up grid of equal halves: each select claims
 * half the row (less half the `gap-2`) and grows, so a pair shares a row evenly
 * and an odd one out stretches to the full width instead of leaving a gap.
 * Before this they sat at whatever width their longest option gave them and
 * wrapped wherever they happened to, which read as a jumble on a phone. Border, radius, focus ring, typography and the `appearance` caret all
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
