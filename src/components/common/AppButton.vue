<!--
  Documentation lives in <script setup>, not here: a comment at the top of the
  template is a second root node, which makes this a fragment component and stops
  `class` and every other attribute from being inherited at all.
-->
<template>
  <Primitive
    :ref="forwardRef"
    :as="resolvedAs"
    :as-child="asChild"
    v-bind="{ ...passthroughAttrs, ...linkAttrs }"
    :type="isNativeButton ? type : undefined"
    :disabled="isNativeButton ? isInert : undefined"
    :aria-disabled="!isNativeButton && isInert ? true : undefined"
    :class="cn(buttonVariants({ variant, size, active, block, tone, emphasis, fill, surface, shape }), className)"
    :title="isTouch ? undefined : (tooltip ?? label)"
    :aria-label="ariaLabel ?? label ?? tooltip"
    @click="onClick"
  >
    <slot name="icon">
      <span
        v-if="loading"
        :class="[iconClass, 'animate-spin rounded-full border-2 border-current border-t-transparent']"
        aria-hidden="true"
      />
      <component v-else-if="icon" :is="icon" :class="iconClass" aria-hidden="true" />
    </slot>

    <slot>
      <template v-if="label">
        <template v-if="mobileLabel">
          <span :class="collapseBelow === 'lg' ? 'max-lg:hidden' : 'max-sm:hidden'">{{ label }}</span>
          <span :class="collapseBelow === 'lg' ? 'lg:hidden' : 'sm:hidden'">{{ mobileLabel }}</span>
        </template>
        <span
          v-else-if="collapseLabelOnMobile"
          :class="collapseBelow === 'lg' ? 'max-lg:hidden' : 'max-sm:hidden'"
        >{{ label }}</span>
        <span v-else>{{ label }}</span>
      </template>
    </slot>

    <component v-if="iconRight" :is="iconRight" :class="iconClass" aria-hidden="true" />
  </Primitive>
</template>

<script setup lang="ts">
/**
 * The app's single button primitive (#561). Every interactive control that used to
 * hand-roll `font-cinzel text-xs` plus its own padding, radius, border, hover and
 * disabled states goes through here, so those live in one place. The class matrix
 * is in `appButtonVariants.ts`.
 *
 * Renders as `<button>` by default; pass `to` for a `<RouterLink>`, `href` for an
 * `<a>`, or `as` for anything else — reka-ui's Primitive handles the swap, and
 * `asChild` lets a wrapper hand its behaviour down, which is how SegmentedControl
 * composes this on top of ToggleGroupItem.
 *
 * Label rendering: `mobileLabel` swaps in a short form below sm;
 * `collapseLabelOnMobile` drops the label entirely, leaving the icon — that is what
 * stops list-page action rows from overflowing narrow screens. The responsive class
 * strings stay static literals so Tailwind picks them up verbatim.
 */
import { computed, useAttrs, type Component, type HTMLAttributes } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import { Primitive, useForwardExpose } from "reka-ui";
import { cn } from "@/lib/utils";
import { useIsTouch } from "@/composables/useBreakpoint";
import {
  buttonVariants,
  ICON_SIZE_CLASS,
  type ButtonVariants,
  type ButtonIconSize,
} from "./appButtonVariants";

// Hover-less pointers get no tooltip: on touch a `title` never appears but does
// hijack long-press. Reactive rather than read once at import, so a hybrid device
// that gains or loses a hover-capable pointer (an iPad picking up a keyboard, a
// laptop docked to a touchscreen) is not stuck with whichever answer was true when
// the module first loaded.
const isTouch = useIsTouch();

const {
  variant,
  size,
  active = false,
  block = false,
  tone = "neutral",
  emphasis = "soft",
  fill = "none",
  surface = "none",
  shape = "default",
  type = "button",
  label,
  icon,
  iconRight,
  iconSize = "sm",
  to,
  href,
  as,
  asChild,
  disabled = false,
  loading = false,
  mobileLabel,
  collapseLabelOnMobile = false,
  collapseBelow = "sm",
  tooltip,
  ariaLabel,
  class: className,
} = defineProps<{
  variant?: ButtonVariants["variant"];
  size?: ButtonVariants["size"];
  /** Visible text. Omit and use the default slot for richer content. */
  label?: string;
  icon?: Component;
  iconRight?: Component;
  /**
   * Glyph size: `xs` 0.75rem, `sm` 0.875rem (default, the historic hard-coded
   * value), `md` 1rem, `lg` 1.25rem. Applies to `icon`, `iconRight` and the
   * loading spinner. Reach for the `#icon` slot only when the glyph needs more
   * than a size — a colour, an opacity, a conditional class.
   */
  iconSize?: ButtonIconSize;
  /**
   * Renders a <RouterLink>. Mutually exclusive with `href` / `as`. Takes anything
   * RouterLink takes, including named-route objects — several call sites navigate
   * by `{ name, query }` rather than a path string.
   */
  to?: RouteLocationRaw;
  /** Renders an <a>. Mutually exclusive with `to` / `as`. */
  href?: string;
  /** Escape hatch for any other tag or component. */
  as?: string | Component;
  /** Lets a parent primitive (e.g. ToggleGroupItem) merge its behaviour in. */
  asChild?: boolean;
  type?: "button" | "submit" | "reset";
  disabled?: boolean;
  /** Swaps the icon for a spinner and blocks clicks. */
  loading?: boolean;
  /** Selected state for toggles and segmented pickers. */
  active?: boolean;
  /** Stretches to the full width of the parent. */
  block?: boolean;
  /** `tinted` only — which colour the pill carries. */
  tone?: ButtonVariants["tone"];
  /** `tinted` only — how loud: resting `soft`, selected `strong`, or `outline`. */
  emphasis?: ButtonVariants["emphasis"];
  /**
   * Whether the button paints a background on hover: `none` (default, text-only),
   * `muted` (neutral wash), or `tone` (tinted by `tone`). See appButtonVariants.
   */
  fill?: ButtonVariants["fill"];
  /** `pill` rounds the control fully — a circular icon button or a chip. */
  shape?: ButtonVariants["shape"];
  /** Background at rest — the companion to `fill`, which only paints on hover. */
  surface?: ButtonVariants["surface"];
  /** Short label shown below sm instead of the full one. */
  mobileLabel?: string;
  /** Hides the label below the `collapseBelow` breakpoint entirely, leaving the icon. */
  collapseLabelOnMobile?: boolean;
  /**
   * Where `mobileLabel` / `collapseLabelOnMobile` take effect. List-page action
   * rows collapse at `sm`; detail-page header actions sit in a tighter row and
   * need `lg`, which is what PageHeaderAction used before it was folded in.
   */
  collapseBelow?: "sm" | "lg";
  /**
   * Supplementary hover text. It must NOT become the accessible name: a button
   * reading "With Party" with the tooltip "With the party — joins new encounters"
   * would stop matching its own visible text, and a voice-control user asking for
   * "With Party" would get no match (WCAG 2.5.3, Label in Name). The tooltip goes
   * to `title`; the accessible name stays the label. Pass `ariaLabel` to override
   * it deliberately.
   */
  tooltip?: string;
  /** Explicit accessible name. Needed when the button has no label at all. */
  ariaLabel?: string;
  class?: HTMLAttributes["class"];
}>();

const emit = defineEmits<{ (e: "click", ev: MouseEvent): void }>();

// An inherited `class` would be appended after the variant classes rather than
// resolved against them, so cn() has to be the only thing writing `class`. Binding
// the rest of $attrs explicitly keeps every other fallthrough attribute working.
defineOptions({ inheritAttrs: false });

// Exposes `$el` so a reka-ui parent using `as-child` (ToggleGroupItem in
// SegmentedControl) can reach the real <button>. Without it the item never joins
// the roving-focus collection and arrow-key navigation silently does nothing.
const { forwardRef } = useForwardExpose();

const attrs = useAttrs();
const passthroughAttrs = computed(() => {
  const { class: _class, ...rest } = attrs;
  return rest;
});

const iconClass = computed(() => `${ICON_SIZE_CLASS[iconSize]} shrink-0`);

const isInert = computed(() => disabled || loading);

// Primitive renders `h(as)` verbatim, so `as` must be the RouterLink *component* —
// the string "RouterLink" would produce a literal <RouterLink> element in the DOM.
const resolvedAs = computed(() => {
  if (as) return as;
  if (to) return RouterLink;
  if (href) return "a";
  return "button";
});

const isNativeButton = computed(() => resolvedAs.value === "button");

const linkAttrs = computed(() => {
  if (as) return {};
  if (to) return { to };
  if (href) return { href };
  return {};
});

function onClick(ev: MouseEvent) {
  // A RouterLink or <a> ignores `disabled`, so the guard has to live here too.
  if (isInert.value) {
    ev.preventDefault();
    ev.stopPropagation();
    return;
  }
  emit("click", ev);
}
</script>
