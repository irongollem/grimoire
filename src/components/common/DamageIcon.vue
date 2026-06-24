<template>
  <span
    class="dmg-icon"
    role="img"
    :aria-label="label ?? type"
    :title="title ?? label ?? capitalize(type)"
    :style="{ '--dmg-mask': `url(${maskUrl})` }"
  />
</template>

<script setup lang="ts">
import type { DamageType } from "@/types/damage.types";

/**
 * A single damage-type glyph rendered as a CSS mask, so it inherits the
 * surrounding text colour (currentColor) and scales with font-size (1em).
 * Source art lives in public/assets/damage-types/<type>.svg.
 */
const {
  type,
  label,
  title,
} = defineProps<{ type: DamageType; label?: string; title?: string }>();

const maskUrl = `${import.meta.env.BASE_URL}assets/damage-types/${type}.svg`;

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
</script>

<style scoped>
.dmg-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--dmg-mask) center / contain no-repeat;
  mask: var(--dmg-mask) center / contain no-repeat;
}
</style>
