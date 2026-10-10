<template>
  <span
    class="mask-icon"
    role="img"
    :aria-label="label"
    :style="{ '--mi-src': `url('${src}')` }"
  />
</template>

<script setup lang="ts">
/**
 * Renders a single-colour SVG asset as a CSS mask, so it inherits the
 * surrounding text colour (currentColor) and scales with font-size (1em).
 * Shared by DamageIcon / MovementIcon and any other glyph-from-asset icon.
 */
const { src, label } = defineProps<{ src: string; label?: string }>();
</script>

<style scoped>
.mask-icon {
  display: inline-block;
  width: 1em;
  height: 1em;
  vertical-align: -0.125em;
  flex-shrink: 0;
  background-color: currentColor;
  -webkit-mask: var(--mi-src) center / contain no-repeat;
  mask: var(--mi-src) center / contain no-repeat;
  /* solid glyphs on a transparent ground — mask by alpha, not luminance */
  -webkit-mask-mode: alpha;
  mask-mode: alpha;
}
</style>
