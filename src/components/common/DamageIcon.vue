<template>
  <span
    class="dmg-icon"
    role="img"
    :aria-label="label ?? type"
    :style="{ '--dmg-mask': `url('${maskUrl}')` }"
  />
</template>

<script setup lang="ts">
import type { DamageType } from "@/types/damage.types";

/**
 * A single damage-type glyph rendered as a CSS mask, so it inherits the
 * surrounding text colour (currentColor) and scales with font-size (1em).
 * Source art lives in public/assets/damage-types/<type>.svg.
 *
 * No `title` tooltip — these print, where hover means nothing; the silent
 * aria-label covers the on-screen preview for screen readers.
 */
const { type, label } = defineProps<{ type: DamageType; label?: string }>();

const maskUrl = `${import.meta.env.BASE_URL}assets/damage-types/${type}.svg`;
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
  /* The glyphs are solid shapes on a transparent ground — mask by alpha, not
     luminance (Chrome's default for an SVG mask source would hide them). */
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
}
</style>
