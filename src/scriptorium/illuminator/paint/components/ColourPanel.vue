<template>
  <section class="flex flex-col gap-3 p-4" aria-label="Colour">
    <div
      ref="square"
      class="relative h-36 w-full touch-none select-none rounded-md border border-border"
      :style="{ backgroundColor: hueColour, backgroundImage: SQUARE_GRADIENT }"
      data-testid="sv-square"
      @pointerdown.prevent="onSquareDown"
      @pointermove="onSquareMove"
      @pointerup="dragging = null"
      @pointercancel="dragging = null"
    >
      <div
        tabindex="0"
        role="slider"
        aria-label="Saturation and brightness"
        :aria-valuenow="Math.round(hsv.s * 100)"
        :aria-valuetext="`Saturation ${Math.round(hsv.s * 100)}%, brightness ${Math.round(hsv.v * 100)}%`"
        aria-valuemin="0"
        aria-valuemax="100"
        class="absolute h-4 w-4 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :style="{ left: `${hsv.s * 100}%`, top: `${(1 - hsv.v) * 100}%`, backgroundColor: hex }"
        data-testid="sv-marker"
        @keydown="onSquareKey"
      />
    </div>

    <div
      ref="strip"
      class="relative h-3.5 w-full touch-none select-none rounded-full border border-border"
      :style="{ backgroundImage: HUE_GRADIENT }"
      data-testid="hue-strip"
      @pointerdown.prevent="onStripDown"
      @pointermove="onStripMove"
      @pointerup="dragging = null"
      @pointercancel="dragging = null"
    >
      <div
        tabindex="0"
        role="slider"
        aria-label="Hue"
        :aria-valuenow="Math.round(hsv.h)"
        aria-valuemin="0"
        aria-valuemax="360"
        :aria-valuetext="`${Math.round(hsv.h)} degrees`"
        class="absolute top-1/2 h-5 w-2 -translate-x-1/2 -translate-y-1/2 rounded-sm border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,0.6)] outline-none focus-visible:ring-2 focus-visible:ring-primary"
        :style="{ left: `${(hsv.h / 360) * 100}%`, backgroundColor: hueColour }"
        @keydown="onStripKey"
      />
    </div>

    <div class="flex items-center gap-2">
      <span class="h-8 w-8 shrink-0 rounded-md border border-border" :style="{ backgroundColor: hex }" aria-hidden="true" />
      <AppInput
        v-model="draft"
        size="sm"
        class="font-mono tabular-nums"
        aria-label="Hex colour"
        :class="invalid ? 'border-destructive' : ''"
        @change="commitHex"
        @focus="invalid = false"
      />
    </div>
    <p v-if="invalid" class="text-caption text-destructive" role="alert">A colour is three or six hex digits, like #c8a24a.</p>

    <div v-if="bookColours.length > 0" class="flex flex-col gap-1.5">
      <span class="text-eyebrow text-muted-foreground">This book's colours</span>
      <div class="flex flex-wrap gap-1.5">
        <ColourSwatch
          v-for="c in bookColours"
          :key="c.label"
          :colour="c.colour"
          :label="`${c.label} ${rgbToHex(c.colour)}`"
          :title="c.label"
          :selected="sameColour(c.colour, colour)"
          @pick="emit('update:colour', $event)"
        />
      </div>
    </div>

    <div v-if="recent.length > 0" class="flex flex-col gap-1.5">
      <span class="text-eyebrow text-muted-foreground">Recent</span>
      <div class="flex flex-wrap gap-1.5">
        <ColourSwatch
          v-for="(c, i) in recent.slice(0, 12)"
          :key="`${i}-${rgbToHex(c)}`"
          :colour="c"
          :label="`Recent colour ${rgbToHex(c)}`"
          @pick="emit('update:colour', $event)"
        />
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef, watch } from "vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { Rgb } from "../engine/types";
import ColourSwatch from "./ColourSwatch.vue";
import { hsvToRgb, parseHex, rgbToHex, rgbToHsv, sameColour, type Hsv } from "./colourMath";

/**
 * The colour panel (frame 09): a saturation/value square over a hue strip, the hex, the book's own colours and
 * the recent ones. Presentational: the colour comes in and every change goes out as `update:colour`.
 */
const { colour, bookColours = [], recent = [] } = defineProps<{
  colour: Rgb;
  /** Swatches drawn from the book's paper and look, each named. */
  bookColours?: { label: string; colour: Rgb }[];
  recent?: Rgb[];
}>();

const emit = defineEmits<{ (e: "update:colour", value: Rgb): void }>();

const SQUARE_GRADIENT = "linear-gradient(to top, #000, transparent), linear-gradient(to right, #fff, transparent)";
const HUE_GRADIENT = "linear-gradient(to right, #f00, #ff0, #0f0, #0ff, #00f, #f0f, #f00)";

// Hue and saturation are lost in grey and black, so the panel keeps its own HSV and only re-reads the colour
// when it was changed from outside (a picked swatch, the picker tool).
const hsv = ref<Hsv>(rgbToHsv(colour));
watch(
  () => colour,
  (c) => {
    if (!sameColour(hsvToRgb(hsv.value), c)) hsv.value = rgbToHsv(c);
  },
);

const hex = computed(() => rgbToHex(colour));
const hueColour = computed(() => rgbToHex(hsvToRgb({ h: hsv.value.h, s: 1, v: 1 })));

function set(next: Hsv) {
  hsv.value = next;
  emit("update:colour", hsvToRgb(next));
}

const draft = ref(hex.value);
const invalid = ref(false);
watch(hex, (h) => {
  draft.value = h;
});
function commitHex() {
  const parsed = parseHex(draft.value);
  if (!parsed) {
    invalid.value = true;
    draft.value = hex.value;
    return;
  }
  invalid.value = false;
  if (!sameColour(parsed, colour)) emit("update:colour", parsed);
  draft.value = rgbToHex(parsed);
}

const square = useTemplateRef<HTMLDivElement>("square");
const strip = useTemplateRef<HTMLDivElement>("strip");
const dragging = ref<"square" | "strip" | null>(null);
const clamp01 = (n: number) => Math.min(1, Math.max(0, n));

function fromSquare(ev: PointerEvent) {
  const r = square.value?.getBoundingClientRect();
  if (!r || r.width <= 0 || r.height <= 0) return;
  set({ h: hsv.value.h, s: clamp01((ev.clientX - r.left) / r.width), v: clamp01(1 - (ev.clientY - r.top) / r.height) });
}
function onSquareDown(ev: PointerEvent) {
  dragging.value = "square";
  square.value?.setPointerCapture?.(ev.pointerId);
  fromSquare(ev);
}
function onSquareMove(ev: PointerEvent) {
  if (dragging.value === "square") fromSquare(ev);
}
function fromStrip(ev: PointerEvent) {
  const r = strip.value?.getBoundingClientRect();
  if (!r || r.width <= 0) return;
  set({ ...hsv.value, h: clamp01((ev.clientX - r.left) / r.width) * 360 });
}
function onStripDown(ev: PointerEvent) {
  dragging.value = "strip";
  strip.value?.setPointerCapture?.(ev.pointerId);
  fromStrip(ev);
}
function onStripMove(ev: PointerEvent) {
  if (dragging.value === "strip") fromStrip(ev);
}

function onSquareKey(ev: KeyboardEvent) {
  const step = ev.shiftKey ? 0.1 : 0.02;
  const d: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] };
  const m = d[ev.key];
  if (!m) return;
  ev.preventDefault();
  set({ h: hsv.value.h, s: clamp01(hsv.value.s + m[0]), v: clamp01(hsv.value.v + m[1]) });
}
function onStripKey(ev: KeyboardEvent) {
  const step = ev.shiftKey ? 20 : 4;
  const d = ev.key === "ArrowRight" || ev.key === "ArrowUp" ? step : ev.key === "ArrowLeft" || ev.key === "ArrowDown" ? -step : 0;
  if (d === 0) return;
  ev.preventDefault();
  set({ ...hsv.value, h: Math.min(360, Math.max(0, hsv.value.h + d)) });
}
</script>
