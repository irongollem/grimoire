<template>
  <RouterLink v-if="to" v-bind="rest" :to="to" :class="cn(CHIP, LINK, attrs.class as ClassValue)">
    <slot />
  </RouterLink>
  <span v-else v-bind="rest" :class="cn(CHIP, attrs.class as ClassValue)">
    <slot />
  </span>
</template>

<script setup lang="ts">
/**
 * The small muted tag chip: a tag on a card or row, a fact on a sheet, a kind
 * or a count beside a heading (#1185). It had been hand-written in some sixty
 * files, each copy drifting a little in padding and overflow; this is the one
 * recipe now. Layout and case (`shrink-0`, `ml-auto`, `uppercase`, `truncate`,
 * `inline-flex items-center gap-1` around a glyph) are classes at the call
 * site, merged through `cn` so one can override a token of the chip.
 *
 * With `to` it is a link chip (a loot table, an encounter, a caster on a
 * sheet): a RouterLink that lights on hover and lays out a leading glyph.
 * A list of plain-text tags with a cap is `TagChips`.
 */
import { computed, useAttrs } from "vue";
import { RouterLink, type RouteLocationRaw } from "vue-router";
import type { ClassValue } from "clsx";
import { cn } from "@/lib/utils";

defineOptions({ inheritAttrs: false });

defineProps<{
  /** Makes the chip a link to this route. */
  to?: RouteLocationRaw;
}>();

// The class goes through `cn` so a call site can override one of the chip's
// tokens; everything else (title, data-testid, listeners) passes straight on.
const attrs = useAttrs();
const rest = computed(() => {
  const { class: _class, ...others } = attrs;
  return others;
});

const CHIP = "rounded bg-muted px-1.5 py-0.5 text-label text-muted-foreground";
const LINK = "inline-flex items-center gap-1 transition-colors hover:bg-muted/70 hover:text-foreground";
</script>
