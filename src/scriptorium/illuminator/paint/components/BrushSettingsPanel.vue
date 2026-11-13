<template>
  <div class="flex h-full min-h-0 flex-col bg-card">
    <div class="flex flex-col gap-2 border-b border-border p-3">
      <AppInput :model-value="brush.name" size="sm" aria-label="Brush name" @update:model-value="patch({ name: String($event) })" />
      <div class="flex gap-2">
        <AppButton variant="subtle" size="xs" :icon="IconUndo" label="Reset" @click="emit('reset')" />
        <AppButton variant="subtle" size="xs" :icon="IconAdd" label="Save as a new brush" class="min-w-0 flex-1" @click="emit('save-as-new')" />
      </div>
      <AutosaveStatusLine v-if="saveStatus" :status="saveStatus" :error="saveError" data-testid="brush-autosave" />
      <div class="overflow-hidden rounded-md border border-border" :style="paperStyle">
        <PaintPreviewCanvas :pixels="stroke" :scale="2" label="This brush's stroke" />
      </div>
    </div>

    <div class="min-h-0 flex-1 overflow-y-auto">
      <!-- Tip -->
      <BrushSection title="Tip" :summary="sectionSummary(brush, 'tip')" open>
        <div class="grid grid-cols-4 gap-1.5">
          <AppButton
            v-for="t in TIP_CHOICES"
            :key="t.id"
            variant="ghost"
            :active="selectedTipId(brush) === t.id"
            :aria-label="t.label"
            :tooltip="t.label"
            class="h-auto flex-col gap-0.5 p-1"
            @click="update(withTip(brush, { source: tipSourceFor(brush, t.id) }))"
          >
            <span class="overflow-hidden rounded-sm border border-border" :style="paperStyle">
              <PaintPreviewCanvas :pixels="tipPicture(t.id)" :scale="2" />
            </span>
          </AppButton>
        </div>
        <PaintSlider layout="row" label="Size" :model-value="brush.tip.size" :min="1" :max="300" :step="1" :percent="false" unit=" px" @update:model-value="update(withTip(brush, { size: $event }))" />
        <PaintSlider layout="row" label="Angle" :model-value="brush.tip.angle" :min="0" :max="359" :step="1" :percent="false" unit="°" @update:model-value="update(withTip(brush, { angle: $event }))" />
        <PaintSlider layout="row" label="Roundness" :model-value="brush.tip.roundness" :min="0.1" @update:model-value="update(withTip(brush, { roundness: $event }))" />
        <PaintSlider layout="row" label="Spacing" :model-value="brush.tip.spacing" :min="0.005" :max="2" :step="0.005" @update:model-value="update(withTip(brush, { spacing: $event }))" />
        <div class="flex flex-wrap gap-x-4 gap-y-1">
          <AppCheckbox size="sm" label="Turns with the stroke" :model-value="brush.tip.followDirection" @update:model-value="update(withTip(brush, { followDirection: $event }))" />
          <AppCheckbox size="sm" label="Flip X" :model-value="brush.tip.flipX" @update:model-value="update(withTip(brush, { flipX: $event }))" />
          <AppCheckbox size="sm" label="Flip Y" :model-value="brush.tip.flipY" @update:model-value="update(withTip(brush, { flipY: $event }))" />
        </div>
        <!-- The idea behind spacing: the same tip stamped far apart, and close enough to melt into a stroke. -->
        <div class="flex flex-col gap-1.5 rounded-md border border-border p-2">
          <div class="overflow-hidden rounded-sm" :style="paperStyle">
            <PaintPreviewCanvas :pixels="apart" :scale="2" label="The tip stamped far apart" />
          </div>
          <div class="overflow-hidden rounded-sm" :style="paperStyle">
            <PaintPreviewCanvas :pixels="stroke" :scale="2" label="The tip at this brush's spacing" />
          </div>
          <p class="text-caption-sm text-muted-foreground">
            Dabs apart, then at {{ Math.round(brush.tip.spacing * 100) }}% spacing, where they melt into a stroke.
          </p>
        </div>
      </BrushSection>

      <!-- Shape -->
      <BrushSection title="Shape" :summary="sectionSummary(brush, 'shape')" :enabled="brush.shape !== null" @update:enabled="update(withSection(brush, 'shape', $event))">
        <template v-for="k in SHAPE_ROWS" :key="k.key">
          <BrushVariedRow :label="k.label" :model-value="(brush.shape ?? emptyShape)[k.key]" :show-minimum="k.minimum" @update:model-value="update(withShape(brush, k.key, $event))" />
        </template>
      </BrushSection>

      <!-- Scatter -->
      <BrushSection title="Scatter" :summary="sectionSummary(brush, 'scatter')" :enabled="brush.scatter !== null" @update:enabled="update(withSection(brush, 'scatter', $event))">
        <template v-if="brush.scatter">
          <PaintSlider layout="row" label="Amount" :model-value="brush.scatter.amount" :max="3" @update:model-value="update(withScatter(brush, { amount: $event }))" />
          <AppCheckbox size="sm" label="Both axes" :model-value="brush.scatter.bothAxes" @update:model-value="update(withScatter(brush, { bothAxes: $event }))" />
          <PaintSlider layout="row" label="Count" :model-value="brush.scatter.count" :min="1" :max="16" :step="1" :percent="false" @update:model-value="update(withScatter(brush, { count: $event }))" />
          <PaintSlider layout="row" label="Count jitter" :model-value="brush.scatter.countJitter" @update:model-value="update(withScatter(brush, { countJitter: $event }))" />
        </template>
      </BrushSection>

      <!-- Grain -->
      <BrushSection title="Grain" :summary="sectionSummary(brush, 'grain')" :enabled="brush.grain !== null" @update:enabled="update(withSection(brush, 'grain', $event))">
        <template v-if="brush.grain">
          <div class="grid grid-cols-5 gap-1.5">
            <AppButton
              v-for="g in GRAIN_CHOICES"
              :key="g.id"
              variant="ghost"
              :active="brush.grain.id === g.id"
              :aria-label="g.label"
              :tooltip="g.label"
              class="h-auto p-1"
              @click="update(withGrain(brush, { id: g.id }))"
            >
              <span class="block h-8 w-8 overflow-hidden rounded-sm border border-border">
                <PaintPreviewCanvas :pixels="grainPicture(g.id)" :scale="2" />
              </span>
            </AppButton>
          </div>
          <PaintSlider layout="row" label="Depth" :model-value="brush.grain.depth" @update:model-value="update(withGrain(brush, { depth: $event }))" />
          <PaintSlider layout="row" label="Scale" :model-value="brush.grain.scale" :min="0.1" :max="4" :step="0.05" :percent="false" unit="x" @update:model-value="update(withGrain(brush, { scale: $event }))" />
          <div class="flex items-center gap-3">
            <span class="w-24 shrink-0 text-caption text-muted-foreground">Mode</span>
            <AppSelect :model-value="brush.grain.mode" size="xs" aria-label="Grain mode" class="min-w-0 flex-1" @update:model-value="update(withGrain(brush, { mode: $event }))">
              <option v-for="m in GRAIN_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
            </AppSelect>
          </div>
        </template>
      </BrushSection>

      <!-- Wet edges: on or off, nothing to open -->
      <BrushSection title="Wet edges" :summary="sectionSummary(brush, 'wetEdges')" :enabled="brush.wetEdges" @update:enabled="patch({ wetEdges: $event })" />

      <!-- Transfer -->
      <BrushSection title="Transfer" :summary="sectionSummary(brush, 'transfer')">
        <PaintSlider layout="row" label="Flow" :model-value="brush.transfer.flow" :min="0.01" @update:model-value="update(withTransfer(brush, { flow: $event }))" />
        <BrushVariedRow label="Flow" :model-value="brush.transfer.flowDynamics" @update:model-value="update(withTransferDynamics(brush, 'flowDynamics', $event))" />
        <PaintSlider layout="row" label="Opacity" :model-value="brush.transfer.opacity" :min="0.01" @update:model-value="update(withTransfer(brush, { opacity: $event }))" />
        <BrushVariedRow label="Opacity" :model-value="brush.transfer.opacityDynamics" @update:model-value="update(withTransferDynamics(brush, 'opacityDynamics', $event))" />
      </BrushSection>

      <!-- Wet mix -->
      <BrushSection title="Wet mix" :summary="sectionSummary(brush, 'wetMix')" :enabled="brush.wetMix !== null" @update:enabled="update(withSection(brush, 'wetMix', $event))">
        <template v-if="brush.wetMix">
          <PaintSlider layout="row" label="Dilution" :model-value="brush.wetMix.dilution" @update:model-value="update(withWetMix(brush, { dilution: $event }))" />
          <PaintSlider layout="row" label="Charge" :model-value="brush.wetMix.charge" @update:model-value="update(withWetMix(brush, { charge: $event }))" />
          <PaintSlider layout="row" label="Pull" :model-value="brush.wetMix.pull" @update:model-value="update(withWetMix(brush, { pull: $event }))" />
        </template>
      </BrushSection>

      <!-- Colour -->
      <BrushSection title="Colour" :summary="sectionSummary(brush, 'colour')" :enabled="brush.colour !== null" @update:enabled="update(withSection(brush, 'colour', $event))">
        <template v-if="brush.colour">
          <PaintSlider layout="row" label="Hue jitter" :model-value="brush.colour.hue" @update:model-value="update(withColour(brush, { hue: $event }))" />
          <PaintSlider layout="row" label="Saturation jitter" :model-value="brush.colour.saturation" @update:model-value="update(withColour(brush, { saturation: $event }))" />
          <PaintSlider layout="row" label="Value jitter" :model-value="brush.colour.value" @update:model-value="update(withColour(brush, { value: $event }))" />
        </template>
      </BrushSection>

      <!-- Smoothing -->
      <BrushSection title="Smoothing" :summary="sectionSummary(brush, 'smoothing')">
        <PaintSlider layout="row" label="Smoothing" :model-value="brush.smoothing" @update:model-value="patch({ smoothing: $event })" />
        <PaintSlider layout="row" label="Fade length" :model-value="brush.fadeLength" :min="0" :max="3000" :step="10" :percent="false" unit=" px" @update:model-value="patch({ fadeLength: $event })" />
      </BrushSection>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AutosaveStatusLine from "@/components/common/feedback/AutosaveStatus.vue";
import type { AutosaveStatus } from "@/composables/useAutosave";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { IconAdd, IconUndo } from "@/lib/icons";
import type { BrushPreset, PaintAssets, ShapeDynamics } from "../engine/types";
import { renderBrushPreview, renderTipPreview } from "../render/brushPreview";
import BrushSection from "./BrushSection.vue";
import PaintSlider from "./PaintSlider.vue";
import BrushVariedRow from "./BrushVariedRow.vue";
import PaintPreviewCanvas from "./PaintPreviewCanvas.vue";
import { PREVIEW_INK, PREVIEW_PAPER } from "./previewPaper";
import {
  GRAIN_CHOICES,
  GRAIN_MODES,
  type ShapeKey,
  TIP_CHOICES,
  sectionSummary,
  selectedTipId,
  tipSourceFor,
  withColour,
  withGrain,
  withScatter,
  withSection,
  withShape,
  withTip,
  withTransfer,
  withTransferDynamics,
  withWetMix,
} from "./brushSettings";

/**
 * The settings of one brush (#1181): a live preview stroke on top, then a section each for tip, shape, scatter,
 * grain, wet edges, transfer, wet mix, colour and smoothing. Every change emits the whole updated brush; the
 * parent owns it.
 */
const { brush, assets, saveStatus = null, saveError = "" } = defineProps<{
  brush: BrushPreset;
  assets: PaintAssets;
  /** Set while a brush of Yours is armed: its changes save themselves, and this says how that is going. */
  saveStatus?: AutosaveStatus | null;
  saveError?: string;
}>();
const emit = defineEmits<{ "update:brush": [brush: BrushPreset]; reset: []; "save-as-new": [] }>();

const update = (next: BrushPreset) => emit("update:brush", next);
const patch = (p: Partial<BrushPreset>) => update({ ...brush, ...p });

const paperStyle = { backgroundColor: PREVIEW_PAPER };
const STROKE_W = 280 * 2;
const STROKE_H = 56 * 2;

const stroke = computed(() => renderBrushPreview(brush, assets, { width: STROKE_W, height: STROKE_H, colour: PREVIEW_INK }));
// Spacing 2.5 puts the dabs a size and a half apart, so each shows by itself.
const apart = computed(() => renderBrushPreview(brush, assets, { width: STROKE_W, height: STROKE_H, colour: PREVIEW_INK, spacingOverride: 2.5 }));

function tipPicture(id: string) {
  // The grid shows each candidate tip with the brush's other settings off, so only the tip differs between cells.
  const shown: BrushPreset = { ...brush, shape: null, scatter: null, grain: null, tip: { ...brush.tip, source: tipSourceFor(brush, id), angle: 0, flipX: false, flipY: false } };
  return renderTipPreview(shown, assets, { width: 64, height: 64, colour: PREVIEW_INK });
}

/** A grain shown as the hollows it would leave in a fill of ink: a stripe of the brush's own tip is not needed. */
function grainPicture(id: string) {
  const grained: BrushPreset = {
    ...brush,
    tip: { ...brush.tip, source: { kind: "round", hardness: 1 }, size: 200, spacing: 0.1 },
    shape: null,
    scatter: null,
    grain: { id, scale: 1, depth: 1, mode: "moving" },
  };
  return renderTipPreview(grained, assets, { width: 64, height: 64, colour: PREVIEW_INK });
}

const emptyShape: ShapeDynamics = {
  size: { jitter: 0, control: "off", minimum: 0 },
  angle: { jitter: 0, control: "off", minimum: 0 },
  roundness: { jitter: 0, control: "off", minimum: 0 },
};
// Angle has no minimum (jitter 1 is a full turn), so its row hides that slider.
const SHAPE_ROWS: ReadonlyArray<{ key: ShapeKey; label: string; minimum: boolean }> = [
  { key: "size", label: "Size", minimum: true },
  { key: "angle", label: "Angle", minimum: false },
  { key: "roundness", label: "Roundness", minimum: true },
];
</script>
