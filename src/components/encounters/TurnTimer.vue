<template>
  <div class="turn-timer" :class="stateClass" :title="`Turn timer — ${seconds}s per turn`">
    <IconClock class="h-3.5 w-3.5 shrink-0" />
    <span class="timer-value tabular-nums">{{ display }}</span>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch, onUnmounted } from "vue";
import { IconClock } from "@/lib/icons";

// A purely-visual, self-contained countdown for the turn-timer optional rule.
// `resetKey` is whatever identifies the current turn (active combatant id +
// round) — whenever it changes the clock restarts from `seconds`. Each side
// (DM runner + every player panel) runs its own copy; a soft ±1s drift between
// them is fine for a nudge timer, so no shared start-timestamp is synced.
const { seconds, resetKey } = defineProps<{
  seconds: number;
  resetKey: string | number;
}>();

const remaining = ref(seconds);
let handle: ReturnType<typeof setInterval> | null = null;

function stop() {
  if (handle) { clearInterval(handle); handle = null; }
}

function start() {
  stop();
  remaining.value = Math.max(0, Math.round(seconds));
  handle = setInterval(() => {
    if (remaining.value <= 0) { stop(); return; }
    remaining.value -= 1;
  }, 1000);
}

watch(() => [resetKey, seconds], start, { immediate: true });
onUnmounted(stop);

const display = computed(() => {
  const s = remaining.value;
  if (s >= 60) {
    const m = Math.floor(s / 60);
    const rem = s % 60;
    return `${m}:${String(rem).padStart(2, "0")}`;
  }
  return `${s}s`;
});

const stateClass = computed(() => {
  if (remaining.value <= 0) return "is-expired";
  if (remaining.value <= 10) return "is-warning";
  return "";
});
</script>

<style scoped>
@reference "@/assets/main.css";

.turn-timer {
  @apply inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-border bg-card font-cinzel text-xs font-semibold text-muted-foreground;
}

.turn-timer.is-warning {
  @apply border-amber-500/50 text-amber-500 bg-amber-500/10;
}

.turn-timer.is-expired {
  @apply border-destructive/60 text-destructive bg-destructive/10 animate-pulse;
}

.timer-value {
  min-width: 2.25rem;
  text-align: center;
}
</style>
