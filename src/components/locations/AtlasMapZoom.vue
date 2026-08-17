<template>
  <!--
    Overlays the map frame during a descent or ascent. It sits on top of the
    live LocationMap rather than replacing it, so the box it animates in is
    exactly the one the reader was already looking at — no measuring, and no
    size jump at the moment the motion starts.
  -->
  <div
    class="absolute inset-0 z-40 overflow-hidden rounded-lg transition-opacity duration-200"
    :class="settling ? 'opacity-0' : 'opacity-100'"
    aria-hidden="true"
  >
    <div
      class="absolute inset-0 flex items-start justify-center will-change-transform"
      :style="fromStyle"
    >
      <img :src="plan.fromUrl" class="block h-auto max-w-full" alt="" draggable="false" />
    </div>

    <div
      class="absolute inset-0 flex items-start justify-center will-change-transform"
      :style="toStyle"
    >
      <img :src="plan.toUrl" class="block h-auto max-w-full" alt="" draggable="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import {
  ZOOM_CHILD_ENTRY_SCALE,
  ZOOM_CROSSFADE_AT,
  ZOOM_DURATION_MS,
  ZOOM_PARENT_BLUR_PX,
  ZOOM_PARENT_SCALE,
  preloadImage,
} from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";

const { plan, settling = false } = defineProps<{
  plan: ZoomPlan;
  /**
   * Set once the real map for the destination has mounted underneath. The
   * overlay then fades rather than cutting — which covers both the frame where
   * the new map has not yet painted, and the fact that two maps of different
   * aspect ratios do not occupy the same box. Cutting produced a visible jitter
   * between the animation landing and the real map appearing.
   */
  settling?: boolean;
}>();

const emit = defineEmits<{ done: [] }>();

const descending = plan.direction === "in";

/**
 * Ascent is the descent's timeline reversed, so the two share one set of
 * numbers. Reading them as start/end pairs rather than duplicating the
 * animation keeps "go back" from drifting into its own effect.
 *
 *   descending  from = the parent, growing away        1 → 7, blurring
 *               to   = the child, arriving          1.25 → 1, fading in
 *   ascending   from = the child, falling away         1 → 1.25, fading out
 *               to   = the parent, resolving           7 → 1, unblurring
 */
const from = descending
  ? { start: 1, end: ZOOM_PARENT_SCALE, blurStart: 0, blurEnd: ZOOM_PARENT_BLUR_PX, opacityEnd: "1" }
  : { start: 1, end: ZOOM_CHILD_ENTRY_SCALE, blurStart: 0, blurEnd: ZOOM_PARENT_BLUR_PX, opacityEnd: "0" };

const to = descending
  ? { start: ZOOM_CHILD_ENTRY_SCALE, end: 1, blurStart: 0, blurEnd: 0 }
  : { start: ZOOM_PARENT_SCALE, end: 1, blurStart: ZOOM_PARENT_BLUR_PX, blurEnd: 0 };

const fromStyle = ref<Record<string, string>>({
  transformOrigin: plan.origin,
  transform: `scale(${from.start})`,
  filter: `blur(${from.blurStart}px) saturate(1)`,
  opacity: "1",
});

const toStyle = ref<Record<string, string>>({
  transformOrigin: plan.origin,
  transform: `scale(${to.start})`,
  filter: `blur(${to.blurStart}px) saturate(${descending ? 1 : 0.6})`,
  opacity: "0",
});

let finishTimer: ReturnType<typeof setTimeout> | undefined;

/**
 * A viewer who has asked for less motion gets the destination, not a shortened
 * version of the journey — the point of the setting is that nothing flies at
 * them, and a fast zoom is still a zoom.
 */
function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

onMounted(async () => {
  if (prefersReducedMotion()) {
    emit("done");
    return;
  }

  // Decode the destination first: a crossfade onto an undecoded image flashes
  // white on precisely the frame the eye is tracking.
  await preloadImage(plan.toUrl);

  // Two frames, not one. A single rAF can still coalesce with the initial paint
  // in some engines, and the transition then has no start value to move from —
  // the element simply appears at its end state and the motion is lost.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      const crossfadeDelay = Math.round(ZOOM_DURATION_MS * ZOOM_CROSSFADE_AT);
      const fadeMs = Math.round(ZOOM_DURATION_MS * 0.35);

      fromStyle.value = {
        transformOrigin: plan.origin,
        transform: `scale(${from.end})`,
        filter: `blur(${from.blurEnd}px) saturate(0.6)`,
        opacity: from.opacityEnd,
        // ease-in on the way out: the departing map accelerates, which is what
        // makes the arriving map's deceleration read as the same movement
        // continuing rather than as a second one starting.
        transition: `transform ${ZOOM_DURATION_MS}ms cubic-bezier(0.4, 0, 0.9, 0.6), filter ${ZOOM_DURATION_MS}ms ease-in, opacity ${fadeMs}ms ease-out ${crossfadeDelay}ms`,
      };

      toStyle.value = {
        transformOrigin: plan.origin,
        transform: `scale(${to.end})`,
        filter: `blur(${to.blurEnd}px) saturate(1)`,
        opacity: "1",
        transition: `transform ${ZOOM_DURATION_MS - crossfadeDelay}ms cubic-bezier(0.2, 0.6, 0.2, 1) ${crossfadeDelay}ms, filter ${ZOOM_DURATION_MS - crossfadeDelay}ms ease-out ${crossfadeDelay}ms, opacity ${fadeMs}ms ease-out ${crossfadeDelay}ms`,
      };

      // Driven by a timer rather than transitionend: each layer owns several
      // transitions, and a dropped or interrupted one would strand the overlay
      // on screen with no way forward.
      finishTimer = setTimeout(() => emit("done"), ZOOM_DURATION_MS + 40);
    });
  });
});

onBeforeUnmount(() => clearTimeout(finishTimer));
</script>
