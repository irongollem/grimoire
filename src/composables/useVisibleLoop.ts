import { onScopeDispose, readonly, ref, watch, type Ref } from "vue";
import { prefersReducedMotion } from "@/lib/motion";

export interface VisibleLoopOptions {
  /** Most frames drawn a second; default 30. */
  fps?: number;
  /** Holds the loop still while true. */
  paused?: Ref<boolean>;
}

/**
 * A frame loop that runs only while the picture can be seen: the element intersects the viewport, the tab is
 * visible, the OS does not ask for reduced motion and the caller has not paused it. Otherwise it costs
 * nothing. `frame` receives the seconds the loop has actually run, which carry on from where it stopped, so a
 * loop that paused for an hour resumes without a jump.
 *
 * Where `requestAnimationFrame` is missing (the test DOM) it never runs; where `IntersectionObserver` is
 * missing the element counts as on screen.
 */
export function useVisibleLoop(target: Ref<Element | null>, frame: (seconds: number) => void, opts: VisibleLoopOptions = {}) {
  const interval = 1000 / (opts.fps ?? 30);
  const running = ref(false);
  let intersecting = typeof IntersectionObserver === "undefined";
  let observer: IntersectionObserver | null = null;
  let id: number | null = null;
  let elapsed = 0;
  let lastTick: number | null = null;
  let lastDraw = Number.NEGATIVE_INFINITY;

  function tick(now: number) {
    id = requestAnimationFrame(tick);
    if (lastTick !== null) elapsed += (now - lastTick) / 1000;
    lastTick = now;
    // A frame early by less than a millisecond is on time: rAF jitters around the interval.
    if (now - lastDraw < interval - 1) return;
    lastDraw = now;
    frame(elapsed);
  }

  function shouldRun(): boolean {
    return (
      typeof requestAnimationFrame === "function" &&
      !!target.value &&
      intersecting &&
      document.visibilityState === "visible" &&
      !prefersReducedMotion() &&
      !opts.paused?.value
    );
  }

  function stop() {
    if (id !== null) cancelAnimationFrame(id);
    id = null;
    lastTick = null;
    lastDraw = Number.NEGATIVE_INFINITY;
    running.value = false;
  }

  function sync() {
    if (shouldRun()) {
      if (id === null) {
        id = requestAnimationFrame(tick);
        running.value = true;
      }
    } else stop();
  }

  watch(
    target,
    (el) => {
      observer?.disconnect();
      observer = null;
      if (el && typeof IntersectionObserver !== "undefined") {
        intersecting = false;
        observer = new IntersectionObserver((entries) => {
          intersecting = entries[entries.length - 1]?.isIntersecting ?? false;
          sync();
        });
        observer.observe(el);
      }
      sync();
    },
    { immediate: true, flush: "post" },
  );
  if (opts.paused) watch(opts.paused, sync);
  document.addEventListener("visibilitychange", sync);
  const motion = typeof window !== "undefined" ? window.matchMedia?.("(prefers-reduced-motion: reduce)") : undefined;
  motion?.addEventListener?.("change", sync);

  onScopeDispose(() => {
    document.removeEventListener("visibilitychange", sync);
    motion?.removeEventListener?.("change", sync);
    observer?.disconnect();
    stop();
  });

  return { running: readonly(running) };
}
