<template>
  <!-- The bookmark from the logo, rippling in the wind: the loading indicator
       for full-screen waits. CSS only: the cloth is cut into strips that each
       show the same picture at their own offset; each sways a little further
       and a little later than the one above (the rod holds the top still), so
       a wave runs down the cloth. Strips overlap so no seams show. The same
       markup and CSS are inlined in index.html for the static boot splash;
       keep the two in step. -->
  <div class="dg-flag" role="status" aria-label="Loading" :style="{ '--w': `${width}px` }">
    <span class="dg-flag__rod" />
    <span v-for="i in STRIPS" :key="i" class="dg-flag__strip" :style="{ '--i': i - 1 }" />
  </div>
</template>

<script setup lang="ts">
const STRIPS = 28;
const { width = 44 } = defineProps<{ width?: number }>();
</script>

<style scoped>
.dg-flag {
  --h: calc(var(--w) * 2.17);
  --n: 28;
  --period: 1.8s;
  --sway: calc(var(--w) * 0.1);
  position: relative;
  width: var(--w);
  height: var(--h);
  margin-top: calc(var(--w) * 0.167);
}
.dg-flag__rod {
  position: absolute;
  z-index: 2;
  left: calc(var(--w) * -0.1235);
  top: calc(var(--w) * -0.167);
  width: calc(var(--w) * 1.247);
  height: calc(var(--w) * 0.167);
  background: url("/brand/bookmark-rod.webp") 0 0 / 100% 100% no-repeat;
}
.dg-flag__strip {
  --t: calc(var(--i) / var(--n));
  --o: 2px;
  position: absolute;
  left: 0;
  width: 100%;
  top: calc(var(--h) * var(--i) / var(--n) - var(--o));
  height: calc(var(--h) / var(--n) + 2 * var(--o));
  background: url("/brand/bookmark-cloth.webp") 0 calc(var(--h) * var(--i) / var(--n) * -1 + var(--o)) / var(--w) var(--h) no-repeat;
  animation: dg-flag-sway var(--period) ease-in-out infinite;
  animation-delay: calc(var(--period) * var(--t) * -0.9);
}
@keyframes dg-flag-sway {
  0%, 100% {
    transform: translateX(calc(var(--sway) * var(--t) * -1)) scaleX(calc(1 - 0.06 * var(--t)));
    filter: brightness(calc(1 - 0.3 * var(--t)));
  }
  50% {
    transform: translateX(calc(var(--sway) * var(--t))) scaleX(1);
    filter: brightness(1);
  }
}
@media (prefers-reduced-motion: reduce) {
  .dg-flag__strip { animation: none; }
}
</style>
