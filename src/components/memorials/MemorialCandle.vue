<template>
  <svg viewBox="0 0 30 70" class="memorial-candle" overflow="visible" aria-hidden="true">
    <template v-if="lit">
      <ellipse class="halo" cx="15" cy="16" rx="22" ry="26" fill="rgb(232 180 80 / .16)" />
      <g class="flame" :class="phase">
        <path d="M15 2c4 6 6.5 9.6 6.5 13.6A6.5 6.5 0 0 1 8.5 15.6C8.5 11.6 11 8 15 2z" fill="#e2a83e" />
        <path d="M15 8c1.8 2.6 2.7 4.2 2.7 5.9a2.7 2.7 0 0 1-5.4 0c0-1.7.9-3.3 2.7-5.9z" fill="#fbe7b0" />
      </g>
    </template>
    <rect x="13.6" y="20" width="2.8" height="4" :fill="lit ? '#3a2f24' : '#5a4c3c'" />
    <rect x="8" y="24" width="14" height="44" rx="1" fill="#e8dcc4" :opacity="lit ? 1 : 0.7" />
    <path d="M8 27 C10 30 12 26 13 31 C14 34 16 28 17 30 C18 32 20 27 22 29 L22 24 L8 24 Z" fill="#f4ecdc" :opacity="lit ? 1 : 0.7" />
    <rect x="8" y="24" width="3" height="44" fill="rgb(0 0 0 / .12)" />
  </svg>
</template>

<script setup lang="ts">
/**
 * A decorative candle for the Hall of the Fallen (#982). The flame flickers in CSS and
 * stops under `prefers-reduced-motion`; an unlit candle (the empty wall's) has no flame
 * and no halo. Wax and flame are fixed warm colours: a candle is light, whatever the
 * theme, so they are not theme tokens. Size it with `--candle-h` (a rem length); the width follows.
 */
withDefaults(defineProps<{ lit?: boolean; phase?: "a" | "b" | "c" }>(), { lit: true, phase: "a" });
</script>

<style scoped>
.memorial-candle {
  height: var(--candle-h, 5rem);
  aspect-ratio: 30 / 70;
}
.flame {
  transform-origin: 50% 92%;
  animation: candle-flicker 2.8s ease-in-out infinite;
}
.flame.b {
  animation-duration: 3.4s;
  animation-delay: -1.1s;
}
.flame.c {
  animation-duration: 2.3s;
  animation-delay: -0.6s;
}
.halo {
  animation: candle-halo 2.8s ease-in-out infinite;
}
@keyframes candle-flicker {
  0%, 100% { transform: scale(1, 1) skewX(0); }
  25% { transform: scale(0.93, 1.07) skewX(2deg); }
  55% { transform: scale(1.05, 0.95) skewX(-2deg); }
  80% { transform: scale(0.97, 1.03) skewX(1deg); }
}
@keyframes candle-halo {
  0%, 100% { opacity: 0.85; }
  50% { opacity: 0.6; }
}
@media (prefers-reduced-motion: reduce) {
  .flame,
  .halo {
    animation: none;
  }
}
</style>
