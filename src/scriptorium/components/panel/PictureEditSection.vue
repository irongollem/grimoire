<template>
  <PanelSection title="Edit picture" data-testid="panel-picture-edit">
    <PanelField label="Edges">
      <SegmentedControl :model-value="edgeStyle" :options="EDGE_STYLES" size="xs" wrap @update:model-value="change(setEdgeStyle(settings, $event))" />
    </PanelField>
    <div class="grid grid-cols-4 gap-2" role="group" aria-label="Which sides">
      <AppCheckbox
        v-for="side in PAPER_SIDES"
        :key="side"
        size="sm"
        :label="SIDE_LABELS[side]"
        :model-value="sides[side]"
        @update:model-value="change(toggleEdgeSide(settings, side))"
      />
    </div>
    <p class="text-caption italic text-muted-foreground">{{ sidesHint }}</p>
    <PanelRange
      v-for="slider in edgeSlidersFor(edgeStyle)"
      :key="slider"
      :label="SLIDER_LABELS[slider]"
      :model-value="Math.round(edgeSliderValue(settings, slider) * 100)"
      :min="0"
      :max="100"
      @update:model-value="change(setEdgeSlider(settings, slider, $event / 100))"
    />

    <PanelField label="Colour">
      <SegmentedControl :model-value="colourValue" :options="COLOUR_PRESETS" size="xs" wrap @update:model-value="change(setColourPreset(settings, $event))" />
    </PanelField>
    <PanelRange
      label="Warmth"
      :model-value="toPanel(gradeValue(settings, 'temperature'))"
      :min="0"
      :max="100"
      @update:model-value="change(setGradeValue(settings, 'temperature', fromPanel($event)))"
    />
    <PanelRange
      label="Contrast"
      :model-value="toPanel(gradeValue(settings, 'contrast'))"
      :min="0"
      :max="100"
      @update:model-value="change(setGradeValue(settings, 'contrast', fromPanel($event)))"
    />

    <PanelRange
      label="Vignette"
      :model-value="Math.round(vignetteStrength(settings) * 100)"
      :min="0"
      :max="100"
      @update:model-value="change(setVignetteStrength(settings, $event / 100))"
    />

    <p class="text-label-lg font-bold uppercase text-muted-foreground">Paper wash</p>
    <IlluminateWashPanel
      :wash="wash"
      @on="change(setWashOn(settings, freshSeed()))"
      @side="change(setWashSide(settings, $event, freshSeed()))"
      @field="(field, value) => change(setWashField(settings, field, value, freshSeed()))"
      @repaint="change(repaintWash(settings, freshSeed()))"
      @remove="change(removeWash(settings))"
    />

    <div class="flex flex-col items-start gap-2 border-t border-border pt-3">
      <AppButton variant="subtle" size="sm" :icon="IconSettings" label="More tools: open the Illuminator…" data-testid="panel-open-workbench" @click="emit('workbench')" />
      <AppButton
        v-if="treated"
        variant="ghost"
        size="sm"
        :icon="IconUndo"
        label="Reset to the original picture"
        data-testid="panel-reset-picture"
        @click="reset"
      />
    </div>
  </PanelSection>
</template>

<script setup lang="ts">
/**
 * The quick edits for a picture, in the panel where it sits (#1176 frame 11).
 * Edges, colour, vignette and the paper wash are all the picture's recipe (`illuminate`): a
 * choice here reads the recipe, changes one step and hands back the write for
 * the picture (`treatmentPatch`), which the parent applies to the image node
 * or the art item. Nothing is kept here, so the workbench opened from "More
 * tools" shows exactly what was set and the other way round.
 */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import PanelSection from "@/scriptorium/components/panel/PanelSection.vue";
import {
  COLOUR_PRESETS,
  EDGE_STYLES,
  colourPresetOf,
  edgeSidesOf,
  edgeSliderValue,
  edgeSlidersFor,
  edgeStyleOf,
  gradeValue,
  setColourPreset,
  setEdgeSlider,
  setEdgeStyle,
  setGradeValue,
  setVignetteStrength,
  toggleEdgeSide,
  vignetteStrength,
  type EdgeSlider,
} from "@/scriptorium/illuminator/lib/recipeEdits";
import IlluminateWashPanel from "@/scriptorium/illuminator/components/IlluminateWashPanel.vue";
import { removeWash, repaintWash, setWashField, setWashOn, setWashSide, washOf } from "@/scriptorium/illuminator/lib/washEdits";
import { PAPER_SIDES, type PaperSide } from "@/scriptorium/illuminator/lib/tornPaper";
import { aiStepOf, parseSettings, type IlluminateSettings } from "@/scriptorium/illuminator/lib/treatment";
import { resetPatch, treatmentPatch, type TreatmentPatch } from "@/scriptorium/lib/panel/pictureTreatment";
import { useConfirm } from "@/composables/useConfirm";
import { IconSettings, IconUndo } from "@/lib/icons";

const { values } = defineProps<{
  /** The picture's own values: an image node's attrs, or art props. */
  values: Record<string, unknown>;
}>();

const emit = defineEmits<{
  patch: [patch: TreatmentPatch];
  workbench: [];
}>();

const SIDE_LABELS: Record<PaperSide, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };
const SLIDER_LABELS: Record<EdgeSlider, string> = { roughness: "Roughness", depth: "Depth", fibres: "Fibres", shadow: "Lift shadow" };

const settings = computed(() => parseSettings(values.illuminate));
const wash = computed(() => washOf(settings.value));
const edgeStyle = computed(() => edgeStyleOf(settings.value));
const sides = computed(() => edgeSidesOf(settings.value));
// A grade that no chip names (set by hand in the workbench) lights no chip.
const colourValue = computed(() => colourPresetOf(settings.value));
const treated = computed(() => typeof values.original === "string" && values.original !== "");

const sidesHint = computed(() => {
  const n = PAPER_SIDES.filter((s) => sides.value[s]).length;
  if (edgeStyle.value === "straight") return "Tick a side to tear it.";
  return n === 4 ? "Tick a side to keep it straight. All four are torn." : `Tick a side to tear or keep it. ${n} of 4 are torn.`;
});

// Warmth and Contrast run -1 to +1 in the recipe; the panel shows 0 to 100 with 50 as neutral.
const toPanel = (v: number) => Math.round((v + 1) * 50);
const fromPanel = (v: number) => v / 50 - 1;

const freshSeed = () => Math.floor(Math.random() * 1e9);

const { confirm } = useConfirm();

/** Back to the original file. An AI result cannot be made again for free, so it asks first. */
async function reset() {
  if (aiStepOf(settings.value) && !(await confirm("This drops the AI result you paid for.", { title: "Use the original picture?", confirmLabel: "Drop it", danger: true }))) return;
  emit("patch", resetPatch(values));
}

function change(next: IlluminateSettings) {
  emit("patch", treatmentPatch(values, next));
}
</script>
