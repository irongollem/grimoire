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
    :title="tooltip ?? label"
    :aria-label="tooltip ?? label"
    @click="onClick"
  >
    <component
      v-if="icon"
      :is="icon"
      class="h-3.5 w-3.5 shrink-0"
      aria-hidden="true"
    />
    <!--
      Label rendered via v-if/v-else so the class string is a static literal
      Tailwind picks up verbatim. Previously used a computed `labelClass`
      returning "hidden sm:inline"; at least one browser was failing to
      collapse the label at runtime. `max-sm:hidden` is a single utility
      that resolves to one media-query-wrapped rule — no cascading / order
      dependency between `hidden` and `sm:inline`.
    -->
    <span v-if="shouldCollapse" class="max-sm:hidden">{{ label }}</span>
    <span v-else>{{ label }}</span>
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
     * Whether the label text collapses on mobile (<sm). Defaults to `true`
     * for every variant — on a list page, an icon plus its context (e.g. `+`
     * on the Bestiary = "new monster", `wand` on NPCs = "generate NPC") is
     * unambiguous and keeps the action row from overflowing. Pass `false`
     * to force the label visible for toggle-state buttons like Kanban/List
     * where the icon alone is ambiguous.
     */
    collapseOnMobile?: boolean;
    /**
     * Override for the `title` / `aria-label`. Use when the visible label
     * describes state ("Kanban") but the tooltip should describe action
     * ("Switch to list view"). Defaults to `label`.
     */
    tooltip?: string;
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
  // Default: collapse for every variant on <sm. An icon + its page context
  // is self-evident ("+ on Bestiary" = create monster), and freeing the
  // label space stops action rows from overflowing on narrow screens.
  return true;
});
</script>
