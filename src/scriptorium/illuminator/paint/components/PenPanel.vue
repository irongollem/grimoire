<template>
  <section class="flex flex-col gap-3 p-4" aria-label="Your pen">
    <h3 class="text-label-lg font-bold uppercase text-foreground">Your pen</h3>

    <ul class="flex flex-wrap gap-2" aria-label="What your pen reports">
      <li v-for="r in reports" :key="r.label">
        <span
          class="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-caption"
          :class="r.on ? 'border-primary/50 bg-primary/10 text-foreground' : 'border-border text-muted-foreground'"
        >
          <span class="font-semibold">{{ r.label }}</span>
          <span class="tabular-nums">{{ r.text }}</span>
        </span>
      </li>
    </ul>

    <div class="flex flex-col gap-2">
      <span class="text-eyebrow text-muted-foreground">Pressure curve</span>
      <svg
        ref="plot"
        viewBox="0 0 100 100"
        class="aspect-square w-full max-w-[14rem] touch-none select-none rounded-md border border-border bg-muted"
        role="group"
        aria-label="Pressure curve"
        @pointermove="onMove"
        @pointerup="drag = null"
        @pointercancel="drag = null"
      >
        <path d="M 25 0 V 100 M 50 0 V 100 M 75 0 V 100 M 0 25 H 100 M 0 50 H 100 M 0 75 H 100" class="stroke-border" stroke-width="0.4" fill="none" />
        <path d="M 0 100 L 100 0" class="stroke-muted-foreground" stroke-width="0.5" stroke-dasharray="2 2" fill="none" />
        <path :d="curvePath" class="stroke-primary" stroke-width="1.6" fill="none" />
        <path :d="handleLines" class="stroke-muted-foreground" stroke-width="0.5" fill="none" />
        <circle
          v-for="h in handles"
          :key="h.key"
          :cx="h.cx"
          :cy="h.cy"
          r="3.2"
          tabindex="0"
          role="slider"
          :aria-label="h.label"
          :aria-valuenow="Math.round(h.point.y * 100)"
          :aria-valuetext="`Input ${Math.round(h.point.x * 100)}%, output ${Math.round(h.point.y * 100)}%`"
          aria-valuemin="0"
          aria-valuemax="100"
          class="cursor-grab fill-primary stroke-background outline-none focus-visible:stroke-foreground"
          stroke-width="1"
          :data-testid="`handle-${h.key}`"
          @pointerdown.prevent="onDown(h.key, $event)"
          @keydown="onKey(h.key, $event)"
        />
      </svg>
      <SegmentedControl
        :model-value="preset ?? ''"
        :options="PRESET_OPTIONS"
        size="xs"
        aria-label="Pressure presets"
        @update:model-value="pickPreset"
      />
    </div>

    <p class="text-caption text-muted-foreground">Kept on this device, for every brush.</p>
    <p class="text-caption text-muted-foreground">Tilt leans a brush that listens to it; a mouse reports neither tilt nor pressure.</p>
    <p class="text-caption text-muted-foreground">
      No pressure in Chrome or Edge on Windows? Turn on Windows Ink in the Wacom tablet settings.
    </p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref, useTemplateRef } from "vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import type { PressureCurve } from "../engine/types";
import { CURVE_PRESETS, matchPreset, nudge, pointFromPointer, type CurvePreset } from "./curveEditor";

/**
 * "Your pen" (frame 04). `reported` says what the last pen events carried (null while none has been seen);
 * the curve is the device's, owned by the caller and stored per device.
 */
const { curve, reported } = defineProps<{
  curve: PressureCurve;
  reported: { pressure: boolean; tilt: boolean; rotation: boolean } | null;
}>();

const emit = defineEmits<{ (e: "update:curve", value: PressureCurve): void }>();

const PRESET_OPTIONS = [
  { value: "soft", label: "Soft" },
  { value: "normal", label: "Normal" },
  { value: "firm", label: "Firm" },
] satisfies { value: CurvePreset; label: string }[];

const reports = computed(() =>
  (
    [
      ["Pressure", reported?.pressure],
      ["Tilt", reported?.tilt],
      ["Rotation", reported?.rotation],
    ] as const
  ).map(([label, on]) => ({ label, on: !!on, text: on ? "reported" : "not reported" })),
);

const preset = computed(() => matchPreset(curve));
function pickPreset(key: string) {
  const p = CURVE_PRESETS[key as CurvePreset];
  if (p) emit("update:curve", { c1: { ...p.c1 }, c2: { ...p.c2 } });
}

// SVG y runs down; the curve's y runs up.
const handles = computed(() =>
  (["c1", "c2"] as const).map((key) => ({
    key,
    point: curve[key],
    cx: curve[key].x * 100,
    cy: 100 - curve[key].y * 100,
    label: key === "c1" ? "Light-touch point of the pressure curve" : "Heavy-press point of the pressure curve",
  })),
);
const curvePath = computed(() => {
  const [a, b] = handles.value;
  return `M 0 100 C ${a.cx} ${a.cy} ${b.cx} ${b.cy} 100 0`;
});
const handleLines = computed(() => {
  const [a, b] = handles.value;
  return `M 0 100 L ${a.cx} ${a.cy} M 100 0 L ${b.cx} ${b.cy}`;
});

const plot = useTemplateRef<SVGSVGElement>("plot");
const drag = ref<"c1" | "c2" | null>(null);
function onDown(key: "c1" | "c2", ev: PointerEvent) {
  drag.value = key;
  plot.value?.setPointerCapture?.(ev.pointerId);
}
function onMove(ev: PointerEvent) {
  if (!drag.value || !plot.value) return;
  const p = pointFromPointer(ev.clientX, ev.clientY, plot.value.getBoundingClientRect());
  emit("update:curve", { ...curve, [drag.value]: p });
}
function onKey(key: "c1" | "c2", ev: KeyboardEvent) {
  const step = ev.shiftKey ? 0.1 : 0.02;
  const delta: Record<string, [number, number]> = {
    ArrowLeft: [-step, 0],
    ArrowRight: [step, 0],
    ArrowUp: [0, step],
    ArrowDown: [0, -step],
  };
  const d = delta[ev.key];
  if (!d) return;
  ev.preventDefault();
  emit("update:curve", nudge(curve, key, d[0], d[1]));
}
</script>
