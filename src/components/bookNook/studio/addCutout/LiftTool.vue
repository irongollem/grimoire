<template>
  <div class="flex flex-col gap-3">
    <ol class="grid gap-2 text-caption text-muted-foreground sm:grid-cols-3">
      <li v-for="(step, i) in STEPS" :key="step" class="flex gap-2">
        <span class="text-label font-semibold text-foreground">{{ i + 1 }}</span>
        <span>{{ step }}</span>
      </li>
    </ol>

    <div class="flex flex-wrap items-center gap-x-3 gap-y-2">
      <SegmentedControl v-model="tool" :options="TOOLS" :disabled="busy" />
      <label class="flex items-center gap-2 text-label text-muted-foreground">
        Size
        <input
          v-model.number="brushSize"
          type="range"
          :min="BRUSH_MIN"
          :max="BRUSH_MAX"
          step="4"
          :disabled="busy"
          class="h-1.5 w-28 cursor-pointer appearance-none rounded-full bg-border accent-primary"
        />
      </label>
      <div class="flex items-center gap-1">
        <AppButton variant="ghost" size="sm" :icon="IconZoomOut" aria-label="Zoom out" tooltip="Zoom out" :disabled="busy" @click="zoomTo('out')" />
        <span class="w-12 text-center text-caption tabular-nums text-muted-foreground" aria-live="polite">{{ zoomPercent }}%</span>
        <AppButton variant="ghost" size="sm" :icon="IconZoomIn" aria-label="Zoom in" tooltip="Zoom in" :disabled="busy" @click="zoomTo('in')" />
        <AppButton variant="ghost" size="sm" label="Fit" :disabled="busy" @click="zoomTo('fit')" />
      </div>
      <div class="flex items-center gap-1">
        <AppButton variant="ghost" size="sm" :icon="IconUndo" label="Undo" :disabled="busy || strokeCount === 0" @click="undo" />
        <AppButton variant="ghost" size="sm" label="Clear" :disabled="busy || strokeCount === 0" @click="clear" />
      </div>
    </div>

    <div
      ref="viewportEl"
      class="relative h-[58vh] touch-none select-none overflow-hidden rounded-lg border border-border bg-muted/30"
      :class="size && !failed ? 'cursor-none' : ''"
      role="group"
      aria-label="The room's picture. Paint over the thing to lift with a pointer; scroll to move, pinch or Ctrl and scroll to zoom."
      @pointerdown="handlers.onPointerDown"
      @pointermove="handlers.onPointerMove"
      @pointerup="handlers.onPointerUp"
      @pointercancel="handlers.onPointerUp"
      @pointerleave="handlers.onPointerLeave"
    >
      <p v-if="failed" class="p-6 text-body text-muted-foreground" role="alert">The room's picture could not be loaded.</p>
      <p v-else-if="!size" class="p-6 text-body text-muted-foreground">Loading the picture…</p>
      <div
        v-show="size && !failed"
        class="absolute left-0 top-0 origin-top-left"
        :style="stageStyle"
      >
        <img :src="src" alt="" draggable="false" class="block h-full w-full" />
        <canvas ref="canvasEl" :width="size?.width ?? 1" :height="size?.height ?? 1" class="absolute inset-0 h-full w-full opacity-50" />
      </div>
      <div
        v-if="cursor && size && !panning && !spaceHeld"
        class="pointer-events-none absolute rounded-full border-2 border-tone-gold"
        :class="erasing ? 'border-dashed' : ''"
        :style="ringStyle"
      />
    </div>

    <label class="flex flex-col gap-1 text-label text-muted-foreground">
      What to lift (optional)
      <AppInput v-model="hint" block :disabled="busy" :maxlength="HINT_MAX" placeholder="the music box, not the table" />
    </label>

    <div class="flex flex-wrap items-center justify-between gap-2">
      <AppButton variant="ghost" size="sm" label="Back" :disabled="busy" @click="emit('back')" />
      <AppButton variant="primary" size="sm" :label="label" :loading="busy" :disabled="!usable" @click="lift" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { BRUSH_MAX, BRUSH_MIN, useLiftCanvas } from "@/composables/bookNook/useLiftCanvas";
import { IconBrush, IconEraser, IconUndo, IconZoomIn, IconZoomOut } from "@/lib/icons";
import type { Size } from "@/lib/bookNook/liftGeometry";
import type { Rect } from "@/lib/bookNook/scene";
import { loadImage } from "./canvas";

/**
 * Lift's first step: the room's picture, zoomable, with a brush to paint over the thing to take out and a few
 * words to say what it is. The paint is a mask in the picture's own pixels. It owns the painting; the dialog owns
 * the price, the credits and the model calls, and hears `lift` with the mask, its bounds and the words.
 */
const { src, label, busy = false } = defineProps<{
  src: string;
  /** The button's words, price included ("Lift · 6 credits"). */
  label: string;
  busy?: boolean;
}>();

export interface LiftSelection {
  /** RGBA bytes of the whole picture at natural size; alpha above 0 is painted. */
  brush: { data: Uint8ClampedArray; width: number; height: number };
  bounds: Rect;
  hint: string | null;
}

const emit = defineEmits<{ lift: [selection: LiftSelection]; back: [] }>();

const STEPS = [
  "Paint over the thing you want. Hold Alt, or pick Eraser, to take paint away.",
  "Say what it is if your paint covers more than one thing.",
  "It becomes a cut-out of its own, and the gap behind it is painted in.",
];
const TOOLS = [
  { value: "brush", label: "Brush", icon: IconBrush },
  { value: "erase", label: "Eraser", icon: IconEraser },
] as const;

/** Smallest painted area worth sending, in picture pixels. */
const MIN_SIDE = 16;
/** The server trims the words to this many characters. */
const HINT_MAX = 300;

const size = ref<Size | null>(null);
const failed = ref(false);
const hint = ref("");
const viewportEl = ref<HTMLElement | null>(null);
const canvasEl = ref<HTMLCanvasElement | null>(null);

const { tool, brushSize, view, strokeCount, bounds, cursor, altHeld, panning, spaceHeld, zoomPercent, zoomTo, reset, undo, clear, selection, handlers } =
  useLiftCanvas({ viewport: viewportEl, canvas: canvasEl, natural: size, busy: () => busy });

watch(
  () => src,
  async (url) => {
    size.value = null;
    failed.value = false;
    try {
      const img = await loadImage(url);
      size.value = { width: img.naturalWidth, height: img.naturalHeight };
      // The canvas takes its new size from the template first; only then can it be cleared and fitted.
      await nextTick();
      reset();
    } catch {
      failed.value = true;
    }
  },
  { immediate: true },
);

const erasing = computed(() => tool.value === "erase" || altHeld.value);
const usable = computed(() => !busy && !!bounds.value && bounds.value.w >= MIN_SIDE && bounds.value.h >= MIN_SIDE);
const stageStyle = computed(() => ({
  width: `${(size.value?.width ?? 0) * view.value.scale}px`,
  height: `${(size.value?.height ?? 0) * view.value.scale}px`,
  transform: `translate(${view.value.tx}px, ${view.value.ty}px)`,
}));
const ringStyle = computed(() => ({
  width: `${brushSize.value}px`,
  height: `${brushSize.value}px`,
  left: `${(cursor.value?.x ?? 0) - brushSize.value / 2}px`,
  top: `${(cursor.value?.y ?? 0) - brushSize.value / 2}px`,
}));

function lift() {
  const picked = selection();
  if (!picked || !usable.value) return;
  const words = hint.value.trim().slice(0, HINT_MAX);
  emit("lift", { ...picked, hint: words === "" ? null : words });
}
</script>
