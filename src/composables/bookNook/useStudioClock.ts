import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useDocumentVisibility, useRafFn } from "@vueuse/core";
import { prefersReducedMotion } from "@/lib/motion";
import { mod } from "@/lib/bookNook/scene";

/** The studio plays at this rate: the same 30 frames a second a screen at the table draws. */
const FPS = 30;

/**
 * The studio's playhead: seconds into the loop, running while Play is on, the tab is visible and nothing holds
 * it (a part being dragged is drawn at a still time). Under the OS's reduce-motion setting it starts paused.
 */
export function useStudioClock(loop: MaybeRefOrGetter<number>) {
  const t = ref(0);
  const playing = ref(!prefersReducedMotion());
  const holds = ref(0);
  const visibility = useDocumentVisibility();
  const running = computed(() => playing.value && holds.value === 0 && visibility.value !== "hidden");

  const raf = useRafFn(
    ({ delta }) => {
      t.value = mod(t.value + delta / 1000, toValue(loop));
    },
    { fpsLimit: FPS, immediate: false },
  );
  watch(running, (on) => (on ? raf.resume() : raf.pause()), { immediate: true });

  /** Jumps the playhead to `seconds`, wrapped into the loop. */
  function seek(seconds: number) {
    t.value = mod(seconds, toValue(loop));
  }
  /** A loop made shorter must not leave the playhead beyond its end. */
  watch(() => toValue(loop), (next) => (t.value = mod(t.value, next)));

  return {
    t,
    playing,
    running,
    seek,
    toggle: () => (playing.value = !playing.value),
    /** Holds the playhead still until the matching `release()` (counted, so two holds need two releases). */
    hold: () => void holds.value++,
    release: () => void (holds.value = Math.max(0, holds.value - 1)),
  };
}
