<template>
  <CartographerOptionsSlip :title="title">
    <!-- Select: a read-only summary of the selected cell, compact until opened. -->
    <template v-if="activeTool === 'select'">
      <template v-if="selectedCell">
        <span class="text-caption text-muted-foreground">
          Cell {{ selectedCell[0] }}, {{ selectedCell[1] }}: {{ cellSummary }}
        </span>
        <AppButton
          variant="ghost"
          fill="muted"
          size="xs"
          :label="detailsOpen ? 'Less' : 'Details'"
          :aria-expanded="detailsOpen"
          @click="detailsOpen = !detailsOpen"
        />
        <dl v-if="detailsOpen" class="basis-full space-y-1 text-caption">
          <div class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Floor</dt>
            <dd class="text-foreground">{{ selectedCellFloor ? "Yes" : "No" }}</dd>
          </div>
          <div class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Rock</dt>
            <dd class="text-foreground">{{ selectedCellSolid ? "Yes" : "No" }}</dd>
          </div>
          <div v-if="selectedCellEdges.length">
            <dt class="text-muted-foreground mb-0.5">Edges</dt>
            <dd v-for="e in selectedCellEdges" :key="e.side" class="flex items-center justify-between gap-4">
              <span>{{ e.side }}</span>
              <span class="text-foreground">{{ edgeKindLabel(e.kind, e.decal) }}</span>
            </dd>
          </div>
          <div v-if="selectedCellObjectCategory" class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Object</dt>
            <dd class="text-foreground">{{ stampLabel(manifest, selectedCellObjectCategory) }}</dd>
          </div>
          <div v-if="annotationText" class="flex items-center justify-between gap-4">
            <dt class="text-muted-foreground">Label</dt>
            <dd class="text-foreground">{{ annotationText }}</dd>
          </div>
          <div v-if="selectedCellLinkedNames.length">
            <dt class="text-muted-foreground mb-0.5">Linked</dt>
            <dd v-for="linkName in selectedCellLinkedNames" :key="linkName">{{ linkName }}</dd>
          </div>
        </dl>
      </template>
      <span v-else class="text-caption text-muted-foreground italic">
        Click a cell to see what is in it. Drag to move the map.
      </span>
    </template>

    <!-- Wall: what the tool paints, or the decal it sets on a wall. -->
    <template v-else-if="activeTool === 'wall'">
      <SegmentedControl
        :model-value="activeWallKind"
        :options="WALL_KINDS"
        size="xs"
        @update:model-value="$emit('update:activeWallKind', $event)"
      />
      <template v-if="activeWallKind === 'decal'">
        <template v-if="wallDecalCount > 0">
          <AppButton
            v-for="i in wallDecalCount"
            :key="i"
            variant="ghost"
            fill="muted"
            size="xs"
            :active="activeWallDecal === i - 1"
            :label="decalLabel(manifest, i - 1)"
            @click="$emit('update:activeWallDecal', i - 1)"
          />
        </template>
        <span v-else class="text-caption-sm text-muted-foreground italic">This pack has no wall decals.</span>
        <span class="text-caption-sm text-muted-foreground">Click a wall to dress it. Alt removes the decal.</span>
      </template>
    </template>

    <!-- Object stamp: the picker, scrolling if the pack names many. -->
    <template v-else-if="activeTool === 'stamp'">
      <div class="flex max-h-20 flex-wrap gap-1 overflow-y-auto">
        <AppButton
          v-for="cat in objectCategories"
          :key="cat"
          variant="ghost"
          fill="muted"
          size="xs"
          :active="activeObjectCategory === cat"
          :label="stampLabel(manifest, cat)"
          @click="$emit('update:activeObjectCategory', cat)"
        />
      </div>
      <RotationControl :model-value="stampRotation" @update:model-value="$emit('update:stampRotation', $event)" />
    </template>

    <!-- Dressing: the props live in the drawer; the slip says where. -->
    <template v-else-if="activeTool === 'dressing'">
      <span class="text-caption text-muted-foreground">
        {{ dressingBrushId
          ? "Click the map to place. Q / E turn it, Esc puts it down."
          : "Pick a prop in the Dressing drawer, or click a placed prop to move it." }}
      </span>
    </template>

    <!-- Label -->
    <template v-else-if="activeTool === 'annotate'">
      <template v-if="selectedCell">
        <AppInput
          ref="annotationInputEl"
          :model-value="annotationText"
          :aria-label="`Label for cell ${selectedCell[0]}, ${selectedCell[1]}`"
          placeholder="Enter label…"
          maxlength="32"
          size="body-xs"
          class="w-48"
          @update:model-value="$emit('update:annotationText', $event)"
        />
        <span class="text-caption-sm text-muted-foreground">Click another cell to move on.</span>
      </template>
      <span v-else class="text-caption text-muted-foreground italic">Click a cell to add a label.</span>
    </template>

    <!-- Link -->
    <template v-else-if="activeTool === 'link'">
      <template v-if="selectedCell">
        <div v-for="slot in linkSlots" :key="slot.key" class="flex items-center gap-1.5">
          <span class="text-label text-muted-foreground">{{ slot.label }}</span>
          <EntityCombobox
            class="w-40"
            :model-value="slot.value"
            :options="slot.options"
            :placeholder="slot.placeholder"
            @update:model-value="slot.update($event)"
          />
        </div>
      </template>
      <span v-else class="text-caption text-muted-foreground italic">Click a cell to attach entities.</span>
    </template>

    <!-- Room: the shape -->
    <template v-else-if="activeTool === 'template'">
      <AppButton
        v-for="shape in templateShapes"
        :key="shape.id"
        variant="ghost"
        fill="muted"
        size="xs"
        :active="activeTemplateShape === shape.id"
        @click="$emit('update:activeTemplateShape', shape.id)"
      >
        <span class="text-base leading-none">{{ shape.icon }}</span>
        <span>{{ shape.label }}</span>
      </AppButton>
      <span class="text-caption-sm text-muted-foreground">Click the centre, drag to size. Walls are added.</span>
    </template>

    <!-- Brush: size -->
    <template v-else-if="activeTool === 'brush'">
      <label class="text-label text-muted-foreground" for="brush-size">Size</label>
      <input
        id="brush-size"
        type="range"
        :min="BRUSH_RADIUS_MIN"
        :max="BRUSH_RADIUS_MAX"
        :step="BRUSH_RADIUS_STEP"
        :value="brushRadius"
        class="h-1.5 w-32 cursor-pointer appearance-none rounded-full bg-border accent-primary"
        @input="(e) => $emit('update:brushRadius', parseFloat((e.target as HTMLInputElement).value))"
      />
      <span class="text-caption text-muted-foreground tabular-nums">{{ brushRadius * 2 * 5 }} ft across</span>
      <span class="text-caption-sm text-muted-foreground">[ and ] resize.</span>
    </template>

    <!-- Everything else has nothing to set: one line says what a click does. -->
    <span v-else class="text-caption text-muted-foreground italic">{{ HINTS[activeTool] }}</span>
  </CartographerOptionsSlip>
</template>

<script setup lang="ts">
// The active tool's options, in the slip over the canvas (the inspector's per-tool
// sections, moved off a side column so the map keeps the width). Presentation only:
// MapWorkbench holds the state and computes the selected-cell summary.
import { computed, ref } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import EntityCombobox from "@/components/common/controls/EntityCombobox.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import CartographerOptionsSlip from "@/components/cartographer/CartographerOptionsSlip.vue";
import RotationControl from "@/components/cartographer/RotationControl.vue";
import type { AppInputHandle } from "@/components/common/controls/fieldVariants";
import type { EdgeSegType } from "@/types/dungeonMap.types";
import type { PackCategory, TilePackManifest } from "@/cartographer/packSchema";
import { decalLabel, stampLabel, type StampCategory } from "@/cartographer/stampCategories";
import { BRUSH_RADIUS_MAX, BRUSH_RADIUS_MIN, BRUSH_RADIUS_STEP } from "@/cartographer/keymap";
import { WALL_KINDS, type WallKind } from "@/cartographer/wallKinds";
import type { Tool } from "@/cartographer/tools";

interface TemplateShape {
  id: string;
  label: string;
  icon: string;
}

interface EntityOption {
  id: string;
  name: string;
}

interface SelectedCellEdge {
  side: "N" | "E" | "S" | "W";
  kind: EdgeSegType;
  /** A `wallDecal` variant dressing a wall edge. */
  decal?: number;
}

const props = defineProps<{
  /** The tool's name, with " erase" appended while Alt inverts it. */
  title: string;
  activeTool: Tool;
  activeObjectCategory: string;
  objectCategories: readonly StampCategory[];
  stampRotation: number;
  /** The active pack's manifest: its `labels` name stamps and decals. Null until a pack loads. */
  manifest: Pick<TilePackManifest, "labels"> | null;
  activeWallKind: WallKind;
  activeWallDecal: number;
  wallDecalCount: number;
  dressingBrushId: string | null;
  selectedCell: [number, number] | null;
  /** Select: a read-only summary of the selected cell. */
  selectedCellFloor: boolean;
  selectedCellSolid: boolean;
  selectedCellEdges: SelectedCellEdge[];
  selectedCellObjectCategory: PackCategory | null;
  selectedCellLinkedNames: string[];
  annotationText: string;
  linkedNoteId: string;
  linkedEncounterId: string;
  linkedTrapId: string;
  linkedFeatureId: string;
  noteOptions: EntityOption[];
  encounterOptions: EntityOption[];
  trapOptions: EntityOption[];
  featureOptions: EntityOption[];
  activeTemplateShape: string;
  templateShapes: TemplateShape[];
  brushRadius: number;
}>();

const emit = defineEmits<{
  "update:activeObjectCategory": [cat: StampCategory];
  "update:stampRotation": [deg: number];
  "update:activeWallKind": [kind: WallKind];
  "update:activeWallDecal": [variant: number];
  "update:annotationText": [text: string];
  "update:linkedNoteId": [id: string];
  "update:linkedEncounterId": [id: string];
  "update:linkedTrapId": [id: string];
  "update:linkedFeatureId": [id: string];
  "update:activeTemplateShape": [shape: string];
  "update:brushRadius": [radius: number];
}>();

const detailsOpen = ref(false);

/** Tools with nothing to set: what a click does, in a line. */
const HINTS: Record<Tool, string> = {
  select: "",
  pan: "Drag to move the map.",
  floor: "Drag to paint floor. Alt erases.",
  terrain: "Paint water over the floor; a cell with no floor gets one. Alt erases the water and keeps the floor.",
  eraser: "Drag to take out floor, walls and objects.",
  wall: "",
  door: "Click a wall edge to add a door; click a door to open or close it. Right-click removes it.",
  solid: "Paint thick, full-cell rock. Alt erases.",
  stamp: "",
  dressing: "",
  rect: "Drag a rectangle of floor. Shift adds perimeter walls. Alt erases.",
  line: "Drag a straight run of floor. Alt erases.",
  fill: "Click to flood-fill a floor region.",
  wrap: "Click a floor region to wall every edge that faces empty space.",
  annotate: "",
  link: "",
  space: "Click a floor region to claim it. Its name, ways out and links show in the Spaces drawer.",
  template: "",
  brush: "",
};

const EDGE_KIND_LABEL: Record<SelectedCellEdge["kind"], string> = {
  wall: "Wall",
  doorClosed: "Closed door",
  doorOpen: "Open door",
  grate: "Grate",
  sluice: "Sluice gate",
};
function edgeKindLabel(kind: SelectedCellEdge["kind"], decal: number | undefined): string {
  return decal === undefined ? EDGE_KIND_LABEL[kind] : `${EDGE_KIND_LABEL[kind]} (decal)`;
}

/** The one-line form of what the Select summary lists below it. */
const cellSummary = computed(() => {
  const parts: string[] = [];
  if (props.selectedCellFloor) parts.push("floor");
  if (props.selectedCellSolid) parts.push("rock");
  if (props.selectedCellEdges.length) parts.push(`${props.selectedCellEdges.length} edge${props.selectedCellEdges.length === 1 ? "" : "s"}`);
  if (props.selectedCellObjectCategory) parts.push("object");
  if (props.annotationText) parts.push(`"${props.annotationText}"`);
  if (props.selectedCellLinkedNames.length) parts.push(`${props.selectedCellLinkedNames.length} link${props.selectedCellLinkedNames.length === 1 ? "" : "s"}`);
  return parts.length ? parts.join(", ") : "empty";
});

// #804: a cell can carry a trap or feature as well as a note and an encounter, and
// draws a glyph for each; `CellMetadata` held both fields long before anything could set them.
const linkSlots = computed(() => [
  { key: "note", label: "Note", value: props.linkedNoteId, options: props.noteOptions, placeholder: "Search notes…", update: (id: string) => emit("update:linkedNoteId", id) },
  { key: "encounter", label: "Encounter", value: props.linkedEncounterId, options: props.encounterOptions, placeholder: "Search encounters…", update: (id: string) => emit("update:linkedEncounterId", id) },
  { key: "trap", label: "Trap", value: props.linkedTrapId, options: props.trapOptions, placeholder: "Search traps…", update: (id: string) => emit("update:linkedTrapId", id) },
  { key: "feature", label: "Feature", value: props.linkedFeatureId, options: props.featureOptions, placeholder: "Search features…", update: (id: string) => emit("update:linkedFeatureId", id) },
]);

const annotationInputEl = ref<AppInputHandle | null>(null);
defineExpose({ annotationInputEl });
</script>
