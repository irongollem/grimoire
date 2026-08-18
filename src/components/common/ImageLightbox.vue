<template>
  <Teleport to="body">
    <div
      v-if="src"
      ref="backdropRef"
      class="fixed inset-0 z-200 flex items-center justify-center bg-black/85 p-4 cursor-zoom-out"
      @click="emit('close')"
    >
      <img
        ref="imgRef"
        :src="src"
        :alt="alt ?? ''"
        class="max-w-full max-h-full object-contain rounded shadow-2xl cursor-default"
        @click.stop
        @load="playEnter"
      />
      <!--
        The catalogued scrim rather than its own alpha. It sits over an arbitrary
        photograph, which is exactly what CARD_OVERLAY_SCRIM is for — and that
        constant exists because this recipe had already been hand-written into
        three components and drifted. It was a fourth copy here, at 0.40 with no
        blur, purely because it predated the constant. `rounded-full` is the one
        real departure: a lone control floating on an image, not a chip in a row.
      -->
      <AppButton
        variant="ghost"
        size="icon-sm"
        :class="[CARD_OVERLAY_SCRIM, 'absolute top-4 right-4 rounded-full text-white/80 hover:text-white']"
        :icon="IconClose"
        aria-label="Close image"
        @click="emit('close')"
      />
    </div>
  </Teleport>
</template>

<script setup lang="ts">
import { nextTick, onUnmounted, ref, watch } from "vue";
import { IconClose } from '@/lib/icons';
import AppButton from "@/components/common/AppButton.vue";
import { CARD_OVERLAY_SCRIM } from "@/components/common/appButtonVariants";
import type { ModalOrigin } from "@/lib/modalOrigin";

const props = defineProps<{
  src?: string | null;
  alt?: string;
  /**
   * Rect of the thumbnail this was opened from. Given one, the full image flies
   * out of it instead of appearing; without one it fades, which is the honest
   * animation for "this did not come from anywhere on screen".
   *
   * Passed as a prop rather than read from `lib/modalOrigin`, and the difference
   * is not stylistic: that store exists because a grid card and a route-driven
   * modal never meet, so the rect has to survive a navigation. Here the thing
   * that was clicked and the thing that opens are in the same component tree and
   * the same tick, so routing the rect through a global single-slot store would
   * add an expiry window and a key-matching failure mode to solve a problem this
   * path does not have.
   */
  origin?: ModalOrigin | null;
}>();
const emit = defineEmits<{ close: [] }>();

const backdropRef = ref<HTMLElement | null>(null);
const imgRef = ref<HTMLImageElement | null>(null);

/**
 * Slower than AppModal's 260ms, on purpose. That number moves a panel a short
 * way; this moves a thumbnail to full-screen, which is a far longer path, and at
 * 260ms it read as a flicker rather than a movement — the eye registers that
 * something changed without ever seeing it travel. Distance wants duration.
 */
const ENTER_MS = 380;
const FADE_MS = 180;

const reducedMotion = () =>
  typeof window !== "undefined" &&
  window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Runs on the image's `load`, not on open.
 *
 * The flight is measured between the thumbnail's rect and the full image's
 * final rect, and that final rect does not exist until the browser knows the
 * image's dimensions — `object-contain` inside a flex centre means the element
 * has no meaningful box before then. Animating on open lands a correct-looking
 * flight into the wrong place. A cached image fires `load` synchronously enough
 * that this is not a perceptible delay.
 */
/**
 * Guards against playing the enter twice for one open.
 *
 * Both triggers below are needed — `load` misses an already-decoded image, and
 * the `complete` check misses one still in flight — but when both fire, the
 * second `animate()` restarts the flight from the thumbnail rect halfway
 * through the first. That is the flash: not a fade artefact, a second animation
 * jumping the picture back to where it started.
 */
const entered = ref(false);

function playEnter() {
  const img = imgRef.value;
  const backdrop = backdropRef.value;
  if (!img || !backdrop || entered.value) return;
  entered.value = true;

  backdrop.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: "ease-out" });

  if (!props.origin || reducedMotion()) {
    img.animate({ opacity: [0, 1] }, { duration: FADE_MS, easing: "ease-out" });
    return;
  }

  const to = img.getBoundingClientRect();
  if (!to.width || !to.height) return;

  // Pixels, because this is a measured flight path between two real rects, not
  // a design value — there is no rem equivalent of "where that thumbnail is".
  // Same shape as AppModal's origin animation, deliberately, so a picture
  // opening from a card and a panel opening from a card move alike.
  const from = `translate(${props.origin.left + props.origin.width / 2 - (to.left + to.width / 2)}px, ${
    props.origin.top + props.origin.height / 2 - (to.top + to.height / 2)
  }px) scale(${Math.min(1, props.origin.width / to.width)})`;

  // No opacity ramp: FocalImage decodes the file before opening, so the picture
  // is fully there from the first frame and only has to travel. Fading it in on
  // top of the movement was the other half of the flash — a brightening landing
  // on an image that was already visible.
  img.animate(
    { transform: [from, "translate(0, 0) scale(1)"] },
    { duration: ENTER_MS, easing: "cubic-bezier(0.22, 1, 0.36, 1)" },
  );
}

// A lightbox opened on an already-decoded image may never fire `load`, so the
// animation is also kicked once the element exists. `entered` makes whichever
// arrives second a no-op.
watch(
  () => props.src,
  async (v) => {
    entered.value = false;
    if (!v) return;
    await nextTick();
    if (imgRef.value?.complete) playEnter();
  },
);

function onKey(e: KeyboardEvent) {
  if (e.key === "Escape") emit("close");
}

watch(
  () => props.src,
  (v) => {
    if (v) window.addEventListener("keydown", onKey);
    else window.removeEventListener("keydown", onKey);
  },
);

onUnmounted(() => window.removeEventListener("keydown", onKey));
</script>
