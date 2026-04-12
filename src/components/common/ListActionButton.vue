<template>
  <!--
    Single button primitive for list-page action bars. Renders as:
    - <RouterLink> when `to` is set
    - <a> when `href` is set
    - <button> otherwise

    Variants map to the three rounded-md button styles duplicated across the
    14 list views. On mobile, non-primary variants collapse to icon-only to
    stop the action bar from overflowing the viewport (the user's tap target
    is the whole button; the `title` attribute exposes the label for
    accessibility and long-press).
  -->
  <component
    :is="rootTag"
    v-bind="rootAttrs"
    :type="rootTag === 'button' ? 'button' : undefined"
    :disabled="rootTag === 'button' ? disabled : undefined"
    :class="buttonClass"
    :title="label"
    :aria-label="label"
    @click="onClick"
  >
    <component
      v-if="icon"
      :is="icon"
      class="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    />
    <span :class="labelClass">{{ label }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";

type Variant = "primary" | "secondary" | "ghost";

const props = withDefaults(
  defineProps<{
    label: string;
    icon?: Component;
    variant?: Variant;
    /** Makes this a <RouterLink>. Mutually exclusive with `href`. */
    to?: string;
    /** Makes this an <a>. Mutually exclusive with `to`. */
    href?: string;
    disabled?: boolean;
    /**
     * Whether the label text collapses on mobile. Defaults to true for
     * secondary/ghost variants (icon-only on <sm) and false for primary
     * (the CTA like "New NPC" always stays visible).
     */
    collapseOnMobile?: boolean;
  }>(),
  {
    variant: "secondary",
    disabled: false,
  },
);

const emit = defineEmits<{
  (e: "click", ev: MouseEvent): void;
}>();

const rootTag = computed(() => {
  if (props.to) return "RouterLink";
  if (props.href) return "a";
  return "button";
});

const rootAttrs = computed(() => {
  if (props.to) return { to: props.to };
  if (props.href) return { href: props.href };
  return {};
});

function onClick(ev: MouseEvent) {
  if (props.disabled) {
    ev.preventDefault();
    return;
  }
  emit("click", ev);
}

const base =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0";

const variantClass = computed(() => {
  switch (props.variant) {
    case "primary":
      // Gold CTA — reserved for the one primary action per page (e.g. "New X").
      return "bg-primary text-primary-foreground hover:opacity-90";
    case "ghost":
      // Subtle — used for "Clear filters" and status-muted actions.
      return "border border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/50";
    case "secondary":
    default:
      // Outlined — Generate, Import, Populate, Web, etc.
      return "border border-border text-foreground hover:bg-accent hover:text-accent-foreground";
  }
});

const buttonClass = computed(() => [base, variantClass.value]);

const shouldCollapse = computed(() => {
  if (props.collapseOnMobile !== undefined) return props.collapseOnMobile;
  // Default: primary stays visible, others collapse to icon on <sm.
  return props.variant !== "primary";
});

const labelClass = computed(() => (shouldCollapse.value ? "hidden sm:inline" : "inline"));
</script>
