<template>
  <div class="space-y-2">
    <p
      class="text-label-lg font-semibold text-muted-foreground"
    >
      FOCAL POINT
      <span
        class="font-fell font-normal normal-case text-muted-foreground/60 ml-1"
      >
        (click image to set)
      </span>
    </p>

    <!--
      The picture is shown whole, at its own shape, and the click is measured
      against the image itself. FocalImage reads a focal point as a percentage of
      the SOURCE picture; this picker used to draw the image object-cover in a
      fixed 3:4 box and store the click as a percentage of the box, so on any
      picture that is not 3:4 (library art is 2:3) the stored point drifted
      vertically, by a few percent near the top and bottom (#965).
    -->
    <div class="relative w-fit max-w-full cursor-crosshair select-none" @click="onPick">
      <img
        ref="imageRef"
        :src="src"
        alt=""
        class="block h-auto max-w-full rounded pointer-events-none"
        :class="imageClass"
        draggable="false"
      />

      <!-- Crosshair dot at current focal point -->
      <div
        v-if="focalPoint"
        class="absolute w-5 h-5 -translate-x-1/2 -translate-y-1/2 pointer-events-none"
        :style="{ left: focalPoint.x + '%', top: focalPoint.y + '%' }"
      >
        <!-- Outer ring -->
        <div
          class="absolute inset-0 rounded-full border-2 border-white opacity-90 shadow-[0_0_0_1px_rgba(0,0,0,0.6)]"
        />
        <!-- Centre dot -->
        <div class="absolute inset-1.25 rounded-full bg-white opacity-90" />
      </div>

      <!-- Placeholder hint when not yet set -->
      <div
        v-else
        class="absolute inset-0 flex items-center justify-center rounded bg-black/20"
      >
        <span class="text-caption text-white/70 italic"
          >Click to set focus</span
        >
      </div>
    </div>

    <!-- Clear button -->
    <button
      v-if="focalPoint && clearable"
      type="button"
      class="text-label-lg text-muted-foreground hover:text-foreground transition-colors"
      @click="focalPoint = null"
    >
      ✕ Clear (use smartcrop)
    </button>
  </div>
</template>

<script setup lang="ts">
import { ref } from "vue";

const focalPoint = defineModel<{ x: number; y: number } | null>({ required: true });
const { imageClass, clearable = true } = defineProps<{
  src: string;
  /** Size limits for the image, e.g. a max height in a modal. It always keeps its own aspect ratio. */
  imageClass?: string;
  /** Offer "Clear (use smartcrop)". The focal queue hides it: there a stray click would save "no point" as checked. */
  clearable?: boolean;
}>();

const imageRef = ref<HTMLImageElement | null>(null);

function onPick(e: MouseEvent) {
  // The wrapper hugs the image, but measure the image itself so a rounding
  // difference in the wrapper can never shift the point.
  const rect = (imageRef.value ?? (e.currentTarget as HTMLElement)).getBoundingClientRect();
  if (!rect.width || !rect.height) return;
  const clamp = (v: number) => Math.max(0, Math.min(100, Math.round(v)));
  focalPoint.value = {
    x: clamp(((e.clientX - rect.left) / rect.width) * 100),
    y: clamp(((e.clientY - rect.top) / rect.height) * 100),
  };
}
</script>
