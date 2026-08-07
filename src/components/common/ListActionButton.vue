<template>
  <AppButton
    v-bind="$attrs"
    :variant="variant"
    :collapse-label-on-mobile="collapseLabelOnMobile"
    class="shrink-0"
    size="md"
  >
    <template v-if="$slots.default" #default><slot /></template>
  </AppButton>
</template>

<script setup lang="ts">
/**
 * An action in a list page's action row — New X, Generate, Import, Populate,
 * Clear filters (#561).
 *
 * Same reasoning as PageHeaderAction: `size="md"` plus label collapse was being
 * restated at all 72 call sites. The collapse is what keeps a list page's action
 * row from overflowing a phone — an icon plus its page context ("+" on the
 * Bestiary means "new monster") is unambiguous, so the label is the thing that
 * gives way. It collapses at `sm` here, unlike PageHeaderAction's `lg`, because
 * a list action row has more room than a detail-page header.
 *
 * No chrome lives here: padding, radius, border, hover and disabled all still
 * come from AppButton. This owns nothing but the prop bundle.
 *
 * Everything else — `label`, `icon`, `to`, `href`, `disabled`, `mobileLabel`,
 * `tooltip`, `@click`, `class` — falls through to AppButton untouched.
 */
import AppButton from "./AppButton.vue";
import type { ButtonVariants } from "./appButtonVariants";

// $attrs is bound explicitly onto AppButton, so it must not also be auto-applied.
defineOptions({ inheritAttrs: false });

const { variant = "outline", collapseLabelOnMobile = true } = defineProps<{
  /** Defaults to `outline`. Use `primary` for the page's single main action. */
  variant?: ButtonVariants["variant"];
  /**
   * Pass `false` for toggle-state buttons (Kanban/List) where the icon alone
   * does not say which state you are in.
   */
  collapseLabelOnMobile?: boolean;
}>();
</script>
