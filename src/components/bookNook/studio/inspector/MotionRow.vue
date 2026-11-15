<template>
  <div class="flex flex-col gap-2 rounded-md border border-border bg-muted/30 p-2" data-testid="motion-row">
    <div class="flex items-center gap-1">
      <AppSelect class="min-w-0 flex-1" :model-value="nameValue" size="body" tone="default" weight="normal" block aria-label="Motion" @update:model-value="pick">
        <option v-for="o in MOTION_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
      </AppSelect>
      <AppButton variant="ghost" fill="muted" size="sm" :icon="IconDelete" label="" aria-label="Remove this motion" @click="remove" />
    </div>

    <p v-if="nameValue === 'Wagging'" class="text-caption text-muted-foreground" data-testid="wag-hint">
      Swings quickly about its pin. Drag the pin (the dot) to where it joins, such as a tail's root.
    </p>

    <p v-if="custom" class="text-caption text-muted-foreground" data-testid="motion-custom">Custom: tuned by hand. The numbers are under Exact.</p>
    <template v-else-if="preset">
      <div v-if="hasStrength" class="flex flex-col gap-1">
        <span class="text-label uppercase text-muted-foreground">Strength</span>
        <SegmentedControl :model-value="preset.strength" :options="STRENGTH_OPTIONS" size="sm" block @update:model-value="setStrength" />
      </div>
      <div class="flex flex-col gap-1">
        <span class="text-label uppercase text-muted-foreground">Pace</span>
        <SegmentedControl :model-value="preset.pace" :options="PACE_OPTIONS" size="sm" block @update:model-value="setPace" />
      </div>
    </template>

    <div v-if="startable" class="flex flex-col gap-1">
      <span class="text-label uppercase text-muted-foreground">Start</span>
      <SegmentedControl :model-value="startValue" :options="START_OPTIONS" size="sm" block @update:model-value="setStartTo" />
    </div>

    <template v-if="motion.kind === 'path'">
      <div class="flex flex-col gap-1" data-testid="path-controls">
        <span class="text-label uppercase text-muted-foreground">The path</span>
        <div class="flex items-center gap-2">
          <AppButton
            variant="outline"
            size="sm"
            :active="drawing"
            :label="drawing ? 'Drawing' : 'Draw it'"
            :aria-pressed="drawing"
            @click="emit('draw', drawing ? null : index)"
          />
          <AppButton variant="ghost" fill="muted" size="sm" label="Clear" :disabled="motion.points.length === 0" @click="clearPoints" />
        </div>
        <p class="text-caption text-muted-foreground">
          {{ motion.points.length < 2 ? "Click to place points or drag a line. It needs two or more." : "Drag a point to bend the path. Double-click one to take it away." }}
        </p>
      </div>

      <div class="flex flex-col gap-1">
        <span class="text-label uppercase text-muted-foreground">Goes</span>
        <SegmentedControl :model-value="goes" :options="GOES_OPTIONS" size="sm" block @update:model-value="setGoes" />
      </div>

      <InspectorToggle :model-value="!!motion.turn" label="Turns to follow the path" @update:model-value="setTurn" />

      <div class="flex flex-col gap-1">
        <AppSelect :key="shareCount" :model-value="''" size="body" tone="default" weight="normal" block aria-label="Share this path with" @update:model-value="share">
          <option value="" disabled>Share this path with…</option>
          <option v-for="other in others" :key="other.id" :value="other.id">{{ layerName(other.id, other.name) }}</option>
        </AppSelect>
        <template v-if="motion.group">
          <p class="text-caption text-muted-foreground" data-testid="path-shared">
            Shared with {{ sharedWith.length === 0 ? "no one else" : sharedWith.map((l) => layerName(l.id, l.name)).join(", ") }}. Bending it bends them all.
          </p>
          <div class="flex flex-wrap items-center gap-2">
            <AppButton variant="outline" size="sm" label="Spread along it evenly" @click="apply({ op: 'spreadPath', group: motion.group })" />
            <AppButton variant="ghost" fill="muted" size="sm" label="Stop sharing" @click="apply({ op: 'unsharePath', id: layer.id, index })" />
          </div>
        </template>
      </div>
    </template>

    <div v-if="motion.kind === 'spin'" class="flex flex-col gap-1">
      <span class="text-label uppercase text-muted-foreground">Direction</span>
      <SegmentedControl :model-value="motion.reverse ? 'back' : 'forward'" :options="SPIN_OPTIONS" size="sm" block @update:model-value="setDirection" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import InspectorToggle from "./InspectorToggle.vue";
import { layerName, type StudioOp } from "@/lib/bookNook/edit";
import { hasStart } from "@/lib/bookNook/motions";
import { describeMotion, MOTION_NAMES, PACES, STRENGTHS, type MotionName, type Pace, type Strength } from "@/lib/bookNook/presets";
import { layersOf, type Layer, type Motion, type Scene } from "@/lib/bookNook/scene";
import { IconDelete } from "@/lib/icons";

/**
 * One of a cut-out's motions (frame 05c): its name, Strength and Pace, where it Starts, and what is particular
 * to it: a path's drawing, direction, turning and sharing, a spin's direction. Every control sends one `StudioOp`
 * for this row's place in the list.
 */
const { layer, index, motion, scene, drawing, apply } = defineProps<{
  layer: Layer;
  index: number;
  motion: Motion;
  scene: Scene;
  /** This row's path is the one being drawn on the stage. */
  drawing: boolean;
  apply: (op: StudioOp) => void;
}>();
const emit = defineEmits<{ draw: [index: number | null] }>();

const cap = (word: string) => word.charAt(0).toUpperCase() + word.slice(1);
const MOTION_OPTIONS = [{ value: "None", label: "None" }, ...MOTION_NAMES.map((n) => ({ value: n, label: n }))];
const STRENGTH_OPTIONS = STRENGTHS.map((s) => ({ value: s, label: cap(s) }));
const PACE_OPTIONS = PACES.map((p) => ({ value: p, label: cap(p) }));
const GOES_OPTIONS = [
  { value: "round", label: "Round" },
  { value: "there", label: "There and back" },
] as const;
const SPIN_OPTIONS = [
  { value: "forward", label: "Clockwise" },
  { value: "back", label: "Anticlockwise" },
] as const;
const START_OPTIONS = [
  { value: "0", label: "0", tooltip: "Starts at the beginning" },
  { value: "0.25", label: "¼", tooltip: "Starts a quarter in" },
  { value: "0.5", label: "½", tooltip: "Starts halfway" },
  { value: "0.75", label: "¾", tooltip: "Starts three quarters in" },
];

/** What each engine motion is called when it matches no preset exactly (a tuned period, say). */
const KIND_NAME: Record<Motion["kind"], MotionName> = { flicker: "Flame", billow: "Cloth", sway: "Hanging", bob: "Floating", drift: "Wandering", path: "Along a path", spin: "Spinning" };

const described = computed(() => describeMotion(motion, layer, scene.loop));
const custom = computed(() => "custom" in described.value);
const preset = computed(() => ("name" in described.value ? described.value : null));
const nameValue = computed(() => (preset.value ? preset.value.name : KIND_NAME[motion.kind]));
const hasStrength = computed(() => motion.kind !== "path" && motion.kind !== "spin");
const startable = computed(() => hasStart(motion));
const startValue = computed(() => {
  const phase = "phase" in motion ? (motion.phase ?? 0) : 0;
  return START_OPTIONS.find((o) => Number(o.value) === phase)?.value ?? "";
});

function pick(raw: string | number | null | undefined) {
  const value = String(raw);
  if (value === "None") return apply({ op: "motionAt", id: layer.id, index, choice: null });
  const name = value as MotionName;
  if (name === nameValue.value && !custom.value) return;
  apply({ op: "motionAt", id: layer.id, index, choice: { name, strength: preset.value?.strength ?? "gentle", pace: preset.value?.pace ?? "steady" } });
}
function setStrength(strength: Strength) {
  if (preset.value) apply({ op: "motionAt", id: layer.id, index, choice: { name: preset.value.name, strength, pace: preset.value.pace } });
}
function setPace(pace: Pace) {
  if (preset.value) apply({ op: "motionAt", id: layer.id, index, choice: { name: preset.value.name, strength: preset.value.strength, pace } });
}
function remove() {
  apply({ op: "motionAt", id: layer.id, index, choice: null });
}
function setStartTo(value: string) {
  apply({ op: "motionStart", id: layer.id, index, start: Number(value) });
}

// ── A path ────────────────────────────────────────────────────────────────────────────────────────────────────
const goes = computed(() => (motion.kind === "path" && motion.closed === false ? "there" : "round"));
const others = computed(() => layersOf(scene).filter((l) => l.id !== layer.id && l.id !== "plate"));
const sharedWith = computed(() =>
  motion.kind === "path" && motion.group
    ? layersOf(scene).filter((l) => l.id !== layer.id && l.motions?.some((m) => m.kind === "path" && m.group === motion.group))
    : [],
);

function setPath(change: Partial<Extract<Motion, { kind: "path" }>>) {
  if (motion.kind === "path") apply({ op: "motionExact", id: layer.id, index, motion: { ...motion, ...change } });
}
function setGoes(value: "round" | "there") {
  setPath({ closed: value === "round" });
}
function setTurn(on: boolean) {
  setPath({ turn: on });
}
function clearPoints() {
  apply({ op: "pathPoints", id: layer.id, index, points: [] });
}
// Rebuilt after each pick so the prompt reads "Share this path with…" again.
const shareCount = ref(0);
function share(value: string | number | null | undefined) {
  shareCount.value++;
  if (typeof value === "string" && value !== "") apply({ op: "sharePath", id: layer.id, index, to: [value] });
}

function setDirection(value: "forward" | "back") {
  if (motion.kind === "spin") apply({ op: "motionExact", id: layer.id, index, motion: { ...motion, reverse: value === "back" } });
}
</script>
