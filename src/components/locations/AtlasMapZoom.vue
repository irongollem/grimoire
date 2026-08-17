<template>
  <!--
    Overlays the map frame during a descent or ascent. It sits on top of the
    live LocationMap rather than replacing it, so the box it animates in is
    exactly the one the reader was already looking at — no measuring, and no
    size jump at the moment the motion starts.

    Opaque on purpose: underneath is the *departing* map, still at rest. Rising,
    that would show a stationary copy of the very image being shrunk away.
  -->
  <div
    class="absolute inset-0 z-40 overflow-hidden rounded-lg bg-background transition-opacity duration-200"
    :class="settling ? 'opacity-0' : 'opacity-100'"
    aria-hidden="true"
  >
    <div
      class="absolute inset-0 flex items-start justify-center will-change-transform"
      :style="fromStyle"
    >
      <img :src="plan.fromUrl" :class="imageClass" alt="" draggable="false" />
    </div>

    <div
      class="absolute inset-0 flex items-start justify-center will-change-transform"
      :style="toStyle"
    >
      <img :src="plan.toUrl" :class="imageClass" alt="" draggable="false" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { onMounted, onBeforeUnmount, ref } from "vue";
import {
  MAP_IMAGE_COMPACT_SIZING,
  MAP_IMAGE_SIZING,
  ZOOM_CHILD_SCALE,
  ZOOM_CROSSFADE_AT,
  ZOOM_DURATION_MS,
  ZOOM_PARENT_BLUR_PX,
  ZOOM_PARENT_SCALE,
  preloadImage,
} from "@/lib/locations/mapZoom";
import type { ZoomPlan } from "@/lib/locations/mapZoom";

const { plan, settling = false, compact = false } = defineProps<{
  plan: ZoomPlan;
  /** Must mirror what the caller passed LocationMap, or the handoff jumps. */
  compact?: boolean;
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

const imageClass = [MAP_IMAGE_SIZING, compact ? MAP_IMAGE_COMPACT_SIZING : ""];

/**
 * Both layers ride one locked trajectory (see ZOOM_CHILD_SCALE): everything on
 * screen grows by 7× descending and shrinks by 7× rising. Which image you see
 * is decided purely by the crossfade — never by the two moving differently.
 *
 *   descending  from = parent   1 → 7      to = child   1/7 → 1
 *   ascending   from = child    1 → 1/7    to = parent    7 → 1
 */
const fromScale = descending ? { start: 1, end: ZOOM_PARENT_SCALE } : { start: 1, end: ZOOM_CHILD_SCALE };
const toScale = descending ? { start: ZOOM_CHILD_SCALE, end: 1 } : { start: ZOOM_PARENT_SCALE, end: 1 };

/**
 * Blur tracks magnification rather than direction: whichever layer is currently
 * blown up is the one that would otherwise show its pixels. It also sells speed
 * at the moment the eye is moving fastest.
 */
const fromBlur = { start: 0, end: ZOOM_PARENT_BLUR_PX };
const toBlur = { start: ZOOM_PARENT_BLUR_PX, end: 0 };

const fromStyle = ref<Record<string, string>>({
  transformOrigin: plan.origin,
  transform: `scale(${fromScale.start})`,
  filter: `blur(${fromBlur.start}px) saturate(1)`,
  opacity: "1",
});

const toStyle = ref<Record<string, string>>({
  transformOrigin: plan.origin,
  transform: `scale(${toScale.start})`,
  filter: `blur(${toBlur.start}px) saturate(0.6)`,
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

      /*
       * One curve, one duration, no delay — for BOTH layers' transforms.
       *
       * This is what keeps the two images locked at `child = parent / 7` for
       * the whole flight, so the crossfade can happen mid-motion without the
       * scenery jumping. Giving the departing and arriving layers different
       * easings (an "accelerate away, decelerate in" flourish) breaks the lock
       * even though each curve looks reasonable on its own. Only opacity is
       * allowed to differ.
       */
      const move = `transform ${ZOOM_DURATION_MS}ms cubic-bezier(0.45, 0, 0.55, 1)`;
      const sharpen = `filter ${ZOOM_DURATION_MS}ms cubic-bezier(0.45, 0, 0.55, 1)`;

      fromStyle.value = {
        transformOrigin: plan.origin,
        transform: `scale(${fromScale.end})`,
        filter: `blur(${fromBlur.end}px) saturate(0.6)`,
        opacity: "0",
        transition: `${move}, ${sharpen}, opacity ${fadeMs}ms ease-out ${crossfadeDelay}ms`,
      };

      toStyle.value = {
        transformOrigin: plan.origin,
        transform: `scale(${toScale.end})`,
        filter: `blur(${toBlur.end}px) saturate(1)`,
        opacity: "1",
        transition: `${move}, ${sharpen}, opacity ${fadeMs}ms ease-out ${crossfadeDelay}ms`,
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
