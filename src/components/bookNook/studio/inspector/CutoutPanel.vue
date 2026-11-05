<template>
  <div class="flex flex-col gap-4">
    <InspectorSection title="How it is held">
      <SegmentedControl :model-value="hold" :options="HOLD_OPTIONS" size="sm" block :disabled="aspect === undefined" @update:model-value="setHold" />
      <p class="text-caption text-muted-foreground" data-testid="hold-hint">{{ HOLD_HINTS[hold] }}</p>
    </InspectorSection>

    <InspectorSection title="Depth">
      <DepthBar :depth="layer.depth" />
      <p class="text-caption text-muted-foreground" data-testid="depth-sentence">{{ depthSentence(layer) }}</p>
      <AppButton variant="link" size="inline-caption" class="self-start" label="Set in the side view" @click="emit('side-view')" />
    </InspectorSection>

    <InspectorSection title="How it moves">
      <SegmentedControl :model-value="motionValue" :options="MOTION_OPTIONS" size="sm" wrap @update:model-value="pickMotion" />
      <template v-if="custom">
        <p class="text-caption text-muted-foreground" data-testid="motion-custom">Custom: tuned by hand. The numbers are under Exact.</p>
      </template>
      <template v-else-if="preset">
        <div class="flex flex-col gap-1">
          <span class="text-label uppercase text-muted-foreground">Strength</span>
          <SegmentedControl :model-value="preset.strength" :options="STRENGTH_OPTIONS" size="sm" block @update:model-value="setStrength" />
        </div>
        <div class="flex flex-col gap-1">
          <span class="text-label uppercase text-muted-foreground">Pace</span>
          <SegmentedControl :model-value="preset.pace" :options="PACE_OPTIONS" size="sm" block @update:model-value="setPace" />
        </div>
      </template>
    </InspectorSection>

    <div class="flex flex-col gap-3">
      <InspectorToggle v-if="hold === 'stands'" :model-value="!!layer.shadow" label="Shadow under it" @update:model-value="apply({ op: 'shadowOn', id: layer.id, on: $event })" />

      <InspectorToggle
        :model-value="!!thrown"
        label="Throws light"
        :disabled="aspect === undefined"
        :hint="throwsHint"
        @update:model-value="apply({ op: 'light', id: layer.id, on: $event, aspect: aspect ?? 1 })"
      />

      <InspectorToggle
        v-if="hold === 'stands'"
        :model-value="!!layer.cast"
        label="Casts a shadow"
        :disabled="lights.length === 0 && !layer.cast"
        :hint="lights.length === 0 && !layer.cast ? 'Add a glow, or let this throw light, to have a light for the shadow to come from.' : 'Pick the light it comes from (a flame, or the window\'s light) and the surface it falls on (the floor, or the wall behind).'"
        @update:model-value="toggleCast"
      >
        <div v-if="layer.cast" class="flex flex-col gap-2">
          <AppSelect :model-value="layer.cast.light" size="body" tone="default" weight="normal" block aria-label="Light the shadow comes from" @update:model-value="castLight">
            <option v-for="light in lights" :key="light.id" :value="light.id">{{ light.label }}</option>
          </AppSelect>
          <SegmentedControl :model-value="surface" :options="SURFACE_OPTIONS" size="sm" block @update:model-value="castSurface" />
        </div>
      </InspectorToggle>

      <InspectorToggle :model-value="!!layer.plane" label="Lies on a side wall" @update:model-value="apply({ op: 'plane', id: layer.id, plane: $event ? defaultPlane() : null })" />
    </div>

    <ExactFold>
      <p v-if="layer.motions?.length" class="font-mono break-words" data-testid="exact-motion">Moves: {{ layer.motions.map(describeRaw).join("; ") }}</p>
      <p class="font-mono">Width {{ round(layer.width) }}, depth {{ round(layer.depth) }}, pinned at {{ round(layer.anchor.x) }}, {{ round(layer.anchor.y) }}</p>
      <p v-if="layer.shadow" class="font-mono">Shadow under it: {{ round(layer.shadow.rx) }} by {{ round(layer.shadow.ry) }}, {{ round(layer.shadow.opacity) }}</p>
      <p v-if="layer.cast" class="font-mono">Casts: from {{ layer.cast.light }} at depth {{ round(layer.cast.depth) }}, {{ round(layer.cast.opacity) }}</p>
      <div v-if="layer.plane" class="grid grid-cols-2 gap-2">
        <label class="flex flex-col gap-1">
          <span>Eye level on the wall (y in the room)</span>
          <AppInput type="number" size="sm" :model-value="layer.plane.horizon" @update:model-value="setPlane('horizon', $event)" />
        </label>
        <label class="flex flex-col gap-1">
          <span>Far end height (share of near end)</span>
          <AppInput type="number" size="sm" :model-value="layer.plane.far" @update:model-value="setPlane('far', $event)" />
        </label>
      </div>
    </ExactFold>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import DepthBar from "./DepthBar.vue";
import ExactFold from "./ExactFold.vue";
import InspectorSection from "./InspectorSection.vue";
import InspectorToggle from "./InspectorToggle.vue";
import { depthSentence, effectLabel, holdOf, lightOf, surfaceOf, type StudioOp, type Surface } from "@/lib/bookNook/edit";
import {
  describeMotion, MOTION_NAMES, PACES, STRENGTHS, type Hold, type MotionName, type Pace, type Strength,
} from "@/lib/bookNook/presets";
import type { Layer, Motion, Scene } from "@/lib/bookNook/scene";

/**
 * What a cut-out is, in the studio's words (frames 03, 05 and 05b): how it is held, where it stands in depth,
 * how it moves, and the shadows and light that go with it. Every control sends one `StudioOp`; the engine's
 * numbers are behind Exact.
 */
const { layer, scene, aspect, apply } = defineProps<{
  layer: Layer;
  scene: Scene;
  /** The layer's image height over width, once its picture has loaded. */
  aspect: number | undefined;
  apply: (op: StudioOp) => void;
}>();
const emit = defineEmits<{ "side-view": [] }>();

const HOLD_HINTS: Record<Hold, string> = {
  stands: "Pinned at its feet. It gets a soft shadow where it meets what it stands on.",
  hangs: "Pinned at its top. The top stays put and the free end moves most.",
  floats: "Pinned at its middle, touching nothing: a bird, a cloud, a lantern on the water.",
};
const HOLD_OPTIONS = [
  { value: "stands", label: "Stands" },
  { value: "hangs", label: "Hangs" },
  { value: "floats", label: "Floats" },
] as const;
const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const MOTION_OPTIONS = [{ value: "None", label: "None" }, ...MOTION_NAMES.map((n) => ({ value: n, label: n }))];
const STRENGTH_OPTIONS = STRENGTHS.map((s) => ({ value: s, label: cap(s) }));
const PACE_OPTIONS = PACES.map((p) => ({ value: p, label: cap(p) }));
const SURFACE_OPTIONS = [
  { value: "wall", label: "Wall behind" },
  { value: "floor", label: "Floor" },
] as const;

const hold = computed(() => holdOf(layer));
function setHold(value: Hold) {
  if (aspect === undefined || value === hold.value) return;
  apply({ op: "hold", id: layer.id, hold: value, aspect });
}

// ── Motion ────────────────────────────────────────────────────────────────────────────────────────────────────
const KIND_NAME: Record<Motion["kind"], MotionName> = { flicker: "Flame", billow: "Cloth", sway: "Hanging", bob: "Floating", drift: "Wandering" };
const motion = computed(() => (layer.motions?.length === 1 ? layer.motions[0] : null));
const described = computed(() => (motion.value ? describeMotion(motion.value, layer, scene.loop) : null));
const custom = computed(() => (layer.motions?.length ?? 0) > 1 || (described.value !== null && "custom" in described.value));
const preset = computed(() => (described.value && "name" in described.value ? described.value : null));
const motionValue = computed(() => {
  if (!layer.motions?.length) return "None";
  return motion.value ? KIND_NAME[motion.value.kind] : "";
});

function pickMotion(value: string) {
  if (value === "None") return apply({ op: "motion", id: layer.id, choice: null });
  const name = value as MotionName;
  if (name === motionValue.value && !custom.value) return;
  apply({ op: "motion", id: layer.id, choice: { name, strength: preset.value?.strength ?? "gentle", pace: preset.value?.pace ?? "steady" } });
}
function setStrength(strength: Strength) {
  if (preset.value) apply({ op: "motion", id: layer.id, choice: { name: preset.value.name, strength, pace: preset.value.pace } });
}
function setPace(pace: Pace) {
  if (preset.value) apply({ op: "motion", id: layer.id, choice: { name: preset.value.name, strength: preset.value.strength, pace } });
}

// ── Light and shadow ──────────────────────────────────────────────────────────────────────────────────────────
const thrown = computed(() => lightOf(scene, layer.id));
const flame = computed(() => layer.motions?.some((m) => m.kind === "flicker") ?? false);
const throwsHint = computed(() => (!!thrown.value && !flame.value ? "Only a flame can throw a flickering light; this adds a steady glow." : undefined));

const lights = computed(() =>
  scene.stack.flatMap((item) => (item.kind === "light" && item.id ? [{ id: item.id, label: effectLabel(item) === "Glow" ? item.id : effectLabel(item) }] : [])),
);
const surface = computed<Surface>(() => surfaceOf(layer) ?? "wall");

function toggleCast(on: boolean) {
  if (!on) return apply({ op: "cast", id: layer.id, cast: null });
  const first = lights.value[0];
  if (first) apply({ op: "cast", id: layer.id, cast: { light: first.id, surface: "wall" } });
}
function castLight(light: string) {
  apply({ op: "cast", id: layer.id, cast: { light, surface: surface.value } });
}
function castSurface(next: Surface) {
  if (layer.cast) apply({ op: "cast", id: layer.id, cast: { light: layer.cast.light, surface: next } });
}

// ── The wall ──────────────────────────────────────────────────────────────────────────────────────────────────
const defaultPlane = () => ({ horizon: Math.round(scene.size.height * 0.45), far: 0.6 });
function setPlane(field: "horizon" | "far", value: string | number | null | undefined) {
  const n = Number(value);
  if (!layer.plane || value === "" || value === null || value === undefined || Number.isNaN(n)) return;
  apply({ op: "plane", id: layer.id, plane: { ...layer.plane, [field]: n } });
}

const round = (n: number) => Math.round(n * 1000) / 1000;
function describeRaw(m: Motion): string {
  const { kind, ...rest } = m;
  return `${kind} ${Object.entries(rest).map(([k, v]) => `${k} ${typeof v === "number" ? round(v) : v}`).join(", ")}`;
}
</script>
