<template>
  <AppButton
    v-bind="$attrs"
    :variant="variant"
    :collapse-label-on-mobile="collapseLabelOnMobile"
    class="shrink-0"
    size="md"
    collapse-below="lg"
  >
    <template v-if="$slots.default" #default><slot /></template>
  </AppButton>
</template>

<script setup lang="ts">
/**
 * An action in a detail page's PageHeader `#actions` slot — Edit, Delete, Save,
 * Send to Scriptorium (#561).
 *
 * This is the one bundle AppButton cannot express as a default: `size="md"`
 * plus `collapse-below="lg"`. Detail-page header rows are tighter than list-page
 * action rows, so their labels have to collapse at `lg` rather than the `sm` that
 * list actions use. That trio lives here rather than at every header action.
 *
 * Everything else — `label`, `icon`, `to`, `disabled`, `mobileLabel`, `tooltip`,
 * `type`, `@click`, `class` — falls through to AppButton untouched.
 */
import AppButton from "./AppButton.vue";
import type { ButtonVariants } from "./appButtonVariants";

// $attrs is bound explicitly onto AppButton, so it must not also be auto-applied.
defineOptions({ inheritAttrs: false });

const { variant = "subtle", collapseLabelOnMobile = true } = defineProps<{
  /** Defaults to `subtle` — the resting look for a header action. */
  variant?: ButtonVariants["variant"];
  /**
   * Header rows are tight; the label hides below `lg` by default and the icon
   * carries the meaning. Pass `false` where the icon alone is ambiguous.
   */
  collapseLabelOnMobile?: boolean;
}>();
</script>
