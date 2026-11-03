<template>
  <div class="flex min-w-0 flex-col gap-2">
    <div
      v-if="headers !== 'hidden'"
      class="grid gap-2"
      :class="headers === 'sticky' ? 'sticky top-0 z-10 bg-card' : ''"
      :style="columnsStyle"
      role="row"
    >
      <component
        :is="mode === 'build' ? AppButton : 'div'"
        v-for="index in visibleLanes"
        :key="`h-${index}`"
        v-bind="mode === 'build' ? { variant: 'ghost', size: 'inline-xs', block: true, class: 'justify-start' } : {}"
        class="flex min-w-0 items-center gap-1.5 border-b-2 pb-1 text-eyebrow font-bold text-foreground"
        :class="LANE_RULE[laneAt(index).category]"
        :aria-label="mode === 'build' ? `Edit ${laneName(index)}` : undefined"
        @click="mode === 'build' ? emit('laneActivate', index) : undefined"
      >
        <span class="truncate">{{ laneName(index) }}</span>
        <!-- One dot = one at a time, two = together. The words are for assistive tech. -->
        <span class="ms-auto flex shrink-0 gap-0.5 text-muted-foreground" :title="RULE_WORDS[laneAt(index).rule]">
          <span class="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
          <span v-if="laneAt(index).rule === 'together'" class="h-1 w-1 rounded-full bg-current" aria-hidden="true" />
          <span class="sr-only">{{ RULE_WORDS[laneAt(index).rule] }}</span>
        </span>
      </component>
    </div>

    <div class="grid" :class="size === 'sm' ? 'gap-1.5' : 'gap-2'" :style="columnsStyle" role="grid">
      <div
        v-for="cell in shownCells"
        :key="`${cell.lane}:${cell.row}`"
        class="min-w-0"
        :data-cell="`${cell.lane}:${cell.row}`"
        @dragover="onDragOver($event, cell)"
        @dragleave="onDragLeave(cell)"
        @drop="onDrop($event, cell)"
      >
        <DeckPad
          :cell="cell"
          :size="size"
          :controls="controls"
          :tool="tool"
          :mode="mode"
          :selected="selectedPadId !== undefined && cell.padId !== null && cell.padId === selectedPadId"
          :drop-over="overKey === keyOf(cell)"
          @press="(p) => emit('press', { lane: cell.lane, row: cell.row, ...p })"
          @release="emit('release', { lane: cell.lane, row: cell.row })"
          @pad-volume="(value) => emit('padVolume', { lane: cell.lane, row: cell.row, value })"
          @select="emit('select', { lane: cell.lane, row: cell.row, padId: cell.padId })"
        />
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import DeckPad from "./DeckPad.vue";
import type { DeckCellView, DeckControls, DeckLaneView, DeckTool } from "@/lib/audio/deck/deckSurface";
import type { DeckLaneRule, SoundCategory } from "@/types/sound.types";

/**
 * The deck's lanes and pads (#1136). It lays out what the snapshot says and
 * re-emits every pad event with the cell's own lane and row, so the controller
 * never has to know which column is on screen: the phone shows four lanes at a
 * time (`laneStart`, `laneCount`) and a press still names its true lane.
 */

const {
  lanes,
  cells,
  rows,
  laneStart = 0,
  laneCount,
  size,
  controls,
  tool,
  mode,
  selectedPadId,
  headers = "shown",
} = defineProps<{
  lanes: readonly DeckLaneView[];
  cells: readonly DeckCellView[];
  rows: number;
  /** First lane shown; the phone pages through four at a time. */
  laneStart?: number;
  /** How many lanes are shown; every lane when absent. */
  laneCount?: number;
  size: "sm" | "md";
  controls: DeckControls;
  tool: DeckTool;
  mode: "play" | "build";
  selectedPadId?: string;
  /** Lane names above the grid: shown, kept in view while the grid scrolls, or left off (the one-row bar). */
  headers?: "shown" | "sticky" | "hidden";
}>();

const emit = defineEmits<{
  press: [payload: { lane: number; row: number; velocity?: number }];
  release: [payload: { lane: number; row: number }];
  padVolume: [payload: { lane: number; row: number; value: number }];
  select: [payload: { lane: number; row: number; padId: string | null }];
  /** Build mode: a header was pressed, to edit that lane. */
  laneActivate: [index: number];
  /** Build mode: something was dropped on a slot. */
  drop: [payload: { lane: number; row: number; event: DragEvent }];
}>();

const LANE_RULE: Record<SoundCategory, string> = {
  music: "border-pad-music",
  ambient: "border-pad-ambient",
  effects: "border-pad-effects",
};
const RULE_WORDS: Record<DeckLaneRule, string> = {
  one: "One at a time",
  together: "Plays together",
};

const count = computed(() => (laneCount === undefined ? lanes.length : laneCount));
const visibleLanes = computed(() => {
  const last = Math.min(lanes.length, laneStart + count.value);
  const out: number[] = [];
  for (let i = laneStart; i < last; i++) out.push(i);
  return out;
});
const columnsStyle = computed(() => ({
  gridTemplateColumns: `repeat(${visibleLanes.value.length}, minmax(0, 1fr))`,
}));

const shownCells = computed(() => {
  const first = laneStart;
  const last = laneStart + visibleLanes.value.length;
  return cells.filter((c) => c.lane >= first && c.lane < last && c.row < rows);
});

function laneAt(index: number): DeckLaneView {
  const lane = lanes[index];
  if (lane === undefined) throw new Error(`DeckGrid: no lane ${index}`);
  return lane;
}
function laneName(index: number): string {
  const name = laneAt(index).name;
  return name === "" ? `Lane ${index + 1}` : name;
}

// ── Build mode: every slot is a drop target ─────────────────────────────

const keyOf = (cell: DeckCellView): string => `${cell.lane}:${cell.row}`;
const overKey = ref<string | null>(null);

function onDragOver(event: DragEvent, cell: DeckCellView): void {
  if (mode !== "build") return;
  event.preventDefault();
  overKey.value = keyOf(cell);
}
function onDragLeave(cell: DeckCellView): void {
  if (overKey.value === keyOf(cell)) overKey.value = null;
}
function onDrop(event: DragEvent, cell: DeckCellView): void {
  if (mode !== "build") return;
  event.preventDefault();
  overKey.value = null;
  emit("drop", { lane: cell.lane, row: cell.row, event });
}
</script>
