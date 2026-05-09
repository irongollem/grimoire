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
    :title="isTouch ? undefined : (tooltip ?? label)"
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
      Label rendering strategy:
      - `mobileLabel` set + `shouldCollapse`: show full label on sm+, short label on <sm
      - `shouldCollapse` only: show label on sm+, icon-only on <sm
      - neither: always show full label
      Class strings are static literals so Tailwind picks them up verbatim.
    -->
    <template v-if="mobileLabel && shouldCollapse">
      <span class="max-sm:hidden">{{ label }}</span>
      <span class="sm:hidden">{{ mobileLabel }}</span>
    </template>
    <span v-else-if="shouldCollapse" class="max-sm:hidden">{{ label }}</span>
    <span v-else>{{ label }}</span>
  </component>
</template>

<script setup lang="ts">
import { computed, type Component } from "vue";

const isTouch = typeof window !== "undefined" && window.matchMedia("(hover: none)").matches;

type Variant = "primary" | "secondary" | "ghost";

const {
  variant = "secondary",
  disabled = false,
  to,
  href,
  collapseOnMobile,
} = defineProps<{
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
   * Short label shown on mobile (<sm) instead of hiding the label entirely.
   * Use for primary "New X" buttons: `mobileLabel="+Monster"` shows "+Monster"
   * on narrow screens while the full label ("New Monster") shows on sm+.
   * Only takes effect when `shouldCollapse` is true (the default).
   */
  mobileLabel?: string;
  /**
   * Override for the `title` / `aria-label`. Use when the visible label
   * describes state ("Kanban") but the tooltip should describe action
   * ("Switch to list view"). Defaults to `label`.
   */
  tooltip?: string;
}>();

const emit = defineEmits<{
  (e: "click", ev: MouseEvent): void;
}>();

const rootTag = computed(() => {
  if (to) return "RouterLink";
  if (href) return "a";
  return "button";
});

const rootAttrs = computed(() => {
  if (to) return { to };
  if (href) return { href };
  return {};
});

function onClick(ev: MouseEvent) {
  if (disabled) {
    ev.preventDefault();
    return;
  }
  emit("click", ev);
}

const base =
  "inline-flex items-center gap-1.5 rounded-md px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors disabled:opacity-50 disabled:cursor-not-allowed shrink-0";

const variantClass = computed(() => {
  switch (variant) {
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
  if (collapseOnMobile !== undefined) return collapseOnMobile;
  // Default: collapse for every variant on <sm. An icon + its page context
  // is self-evident ("+ on Bestiary" = create monster), and freeing the
  // label space stops action rows from overflowing on narrow screens.
  return true;
});
</script>
