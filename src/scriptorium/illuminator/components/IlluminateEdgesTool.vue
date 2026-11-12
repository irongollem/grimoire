<template>
  <div class="flex flex-col" data-testid="tool-panel-edges">
    <div class="flex flex-col gap-3 px-4 py-4">
      <SegmentedControl :model-value="edgeStyle" :options="EDGE_STYLES" size="xs" wrap @update:model-value="emit('style-change', $event)" />

      <p v-if="edgeStyle === 'straight'" class="text-caption italic text-muted-foreground">Pick a style to tear or fade the edges.</p>

      <template v-else>
        <div class="grid grid-cols-4 gap-2" role="group" aria-label="Which sides">
          <AppCheckbox
            v-for="side in PAPER_SIDES"
            :key="side"
            size="sm"
            :label="SIDE_LABELS[side]"
            :model-value="sidesOn[side]"
            @update:model-value="emit('side', side, $event)"
          />
        </div>

        <!-- Torn paper: one set of sliders for every torn side. -->
        <template v-if="edgeStyle === 'paper'">
          <div v-for="slider in PAPER_SLIDERS" :key="slider.key">
            <div class="mb-1 flex items-center justify-between">
              <label class="text-eyebrow text-muted-foreground" :for="`paper-${slider.key}`">{{ slider.label }}</label>
              <span class="text-caption tabular-nums text-muted-foreground">{{ Math.round(paperValue(slider.key) * 100) }}</span>
            </div>
            <input
              :id="`paper-${slider.key}`"
              type="range"
              min="0"
              max="1"
              step="0.01"
              :value="paperValue(slider.key)"
              class="h-1.5 w-full cursor-pointer appearance-none rounded-full bg-border accent-primary"
              @input="(e) => emit('paper-slider', slider.key, parseFloat((e.target as HTMLInputElement).value))"
            />
          </div>
        </template>
      </template>
    </div>

    <!-- Classic and Faded keep their per-side controls: roughness, fade, depth, passes, variation. -->
    <IlluminateEdgePanel
      v-if="edgeStyle === 'classic' || edgeStyle === 'faded'"
      :opts="classic"
      :open="true"
      :edge-open="edgeOpen"
      @toggle-edge="(edge) => (edgeOpen[edge] = !edgeOpen[edge])"
      @set-edge-enabled="(edge, value) => emit('side', edge, value)"
      @set-slider="(edge, key, value) => emit('classic-slider', edge, key, value)"
    />
  </div>
</template>

<script setup lang="ts">
/**
 * The Edges tool (#1176 frame 12): the four styles, the sides to tear, and the
 * sliders each style has. Torn paper's sliders move every torn side together;
 * the classic tear keeps its per-side panel, so nothing the old Illuminator
 * could do is gone.
 */
import { computed, reactive } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import IlluminateEdgePanel from "@/scriptorium/illuminator/components/IlluminateEdgePanel.vue";
import type { EdgeOptions, EdgeTreatmentOptions } from "@/scriptorium/illuminator/lib/edgeTreatment";
import { EDGE_STYLES, type EdgeStyle } from "@/scriptorium/illuminator/lib/recipeEdits";
import { PAPER_SIDES, type PaperEdgeOptions, type PaperSide, type PaperSideOptions } from "@/scriptorium/illuminator/lib/tornPaper";

type PaperSlider = "roughness" | "depth" | "fibres" | "shadow";

const { edgeStyle, classic, paper } = defineProps<{
  edgeStyle: EdgeStyle;
  classic: EdgeTreatmentOptions;
  paper: PaperEdgeOptions;
}>();

const emit = defineEmits<{
  "style-change": [value: EdgeStyle];
  side: [side: PaperSide, value: boolean];
  "paper-slider": [key: PaperSlider, value: number];
  "classic-slider": [side: PaperSide, key: keyof EdgeOptions, value: number];
}>();

const SIDE_LABELS: Record<PaperSide, string> = { top: "Top", right: "Right", bottom: "Bottom", left: "Left" };
const PAPER_SLIDERS: { key: PaperSlider; label: string }[] = [
  { key: "roughness", label: "Roughness" },
  { key: "depth", label: "Tear depth" },
  { key: "fibres", label: "Fibres" },
  { key: "shadow", label: "Lift shadow" },
];

const edgeOpen = reactive<Record<string, boolean>>({ top: false, right: false, bottom: false, left: false });
const sidesOn = computed<Record<PaperSide, boolean>>(() => ({
  top: paper.top.enabled || classic.top.enabled,
  right: paper.right.enabled || classic.right.enabled,
  bottom: paper.bottom.enabled || classic.bottom.enabled,
  left: paper.left.enabled || classic.left.enabled,
}));

/** The slider shows the first torn side's value, and moves them all. */
function paperValue(key: PaperSlider): number {
  const side = PAPER_SIDES.find((s) => sidesOn.value[s]) ?? "top";
  return (paper[side] as PaperSideOptions)[key];
}
</script>
