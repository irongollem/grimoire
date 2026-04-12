<template>
  <span
    class="dice-result"
    :class="{
      'dice-crit': isSettled && isCrit,
      'dice-fumble': isSettled && isFumble,
      'dice-settling': !isSettled,
    }"
  >{{ displayed }}</span>
</template>

<script setup lang="ts">
import { ref, watch, onUnmounted } from "vue";

const props = withDefaults(
  defineProps<{
    value: number;
    isCrit?: boolean;
    isFumble?: boolean;
    /** Approximate upper bound used for scramble range. Default 20. */
    maxRandom?: number;
  }>(),
  { isCrit: false, isFumble: false, maxRandom: 20 },
);

const displayed = ref<number>(props.value);
const isSettled = ref(true);

let intervalId: ReturnType<typeof setTimeout> | null = null;
let timeoutId: ReturnType<typeof setTimeout> | null = null;

/** Duration of the scramble in ms. */
const SCRAMBLE_MS = 500;
/** Starting interval between number swaps (fast). */
const INTERVAL_START = 40;
/** Ending interval between number swaps (slow, settling). */
const INTERVAL_END = 160;

function clearTimers() {
  if (intervalId !== null) clearTimeout(intervalId);
  if (timeoutId !== null) clearTimeout(timeoutId);
  intervalId = null;
  timeoutId = null;
}

function randomInt(max: number): number {
  return Math.floor(Math.random() * max) + 1;
}

function startScramble(finalValue: number) {
  clearTimers();
  isSettled.value = false;

  const max = props.maxRandom;
  const start = performance.now();
  let currentInterval = INTERVAL_START;

  function tick() {
    displayed.value = randomInt(max);
    const elapsed = performance.now() - start;
    const progress = Math.min(elapsed / SCRAMBLE_MS, 1);
    // Ease the interval: lerp from fast → slow as progress → 1
    currentInterval = INTERVAL_START + (INTERVAL_END - INTERVAL_START) * progress;
    intervalId = setTimeout(tick, currentInterval);
  }

  intervalId = setTimeout(tick, currentInterval);

  timeoutId = setTimeout(() => {
    clearTimers();
    displayed.value = finalValue;
    isSettled.value = true;
  }, SCRAMBLE_MS);
}

watch(() => props.value, startScramble, { immediate: true });

onUnmounted(clearTimers);
</script>

<style scoped>
@reference "@/assets/main.css";

.dice-result {
  @apply font-cinzel font-bold tabular-nums transition-colors duration-300;
}

.dice-settling {
  @apply opacity-80;
}

.dice-crit {
  @apply text-amber-500;
  animation: dice-crit-flash 0.6s ease-out forwards;
}

.dice-fumble {
  @apply text-destructive;
  animation: dice-fumble-flash 0.6s ease-out forwards;
}

@keyframes dice-crit-flash {
  0%   { text-shadow: 0 0 12px theme('colors.amber.400'), 0 0 24px theme('colors.amber.500'); }
  60%  { text-shadow: 0 0 6px theme('colors.amber.400'); }
  100% { text-shadow: none; }
}

@keyframes dice-fumble-flash {
  0%   { text-shadow: 0 0 12px hsl(var(--destructive)), 0 0 24px hsl(var(--destructive)); }
  60%  { text-shadow: 0 0 6px hsl(var(--destructive)); }
  100% { text-shadow: none; }
}
</style>
