<template>
  <template v-if="editing && selected">
    <AppInput
      :model-value="selected.name"
      size="body-xs"
      aria-label="Shape name"
      class="w-48"
      @update:model-value="rename"
    />
  </template>
  <template v-else-if="!editing">
    <SegmentedControl
      :model-value="regionMode"
      :options="shapeOptions"
      size="xs"
      aria-label="Brush shape"
      @update:model-value="emit('update:regionMode', $event)"
    />
    <span v-if="regionMode === 'extend' && selected" class="text-caption text-foreground">Extending: {{ selected.name }}</span>
    <span v-else-if="regionMode === 'extend'" class="text-caption text-muted-foreground">Select a shape to extend.</span>
    <span v-else-if="selected" class="text-caption text-foreground">Selected: {{ selected.name }}. Alt cuts this shape.</span>
    <SegmentedControl
      :model-value="category"
      :options="CATEGORY_OPTIONS"
      size="xs"
      aria-label="Ground material"
      :disabled="regionMode === 'extend'"
      @update:model-value="emit('update:category', $event)"
    />
  </template>
  <div v-if="!editing || selected" class="flex flex-wrap items-center gap-1.5">
    <span class="text-label text-muted-foreground">Walls</span>
    <SegmentedControl
      :model-value="wallMode"
      :options="WALL_OPTIONS"
      size="xs"
      aria-label="Boundary walls"
      @update:model-value="emit('update:wallMode', $event)"
    />
  </div>
  <span v-if="!editing || selected" class="text-caption-sm text-muted-foreground">{{ WALL_HINTS[wallMode] }}</span>
  <AppButton
    v-if="editing && selected"
    variant="destructive"
    size="xs"
    :icon="IconDelete"
    label="Delete shape"
    @click="emit('delete')"
  />
  <span v-if="!editing" class="text-caption-sm text-muted-foreground">B toggles walls. Alt cuts the selected shape.</span>
</template>

<script setup lang="ts">
// A material boundary remains editable even when it carries no physical wall.
// These controls name the target and wall state so painting never guesses either.
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import { IconDelete } from "@/lib/icons";
import type { BrushRegionMode, GroundWallMode } from "@/types/dungeonMap.types";

const {
  selected,
  regionMode = "new",
  category = "floor",
  editing = false,
} = defineProps<{
  selected: { id: string; name: string } | null;
  wallMode: GroundWallMode;
  regionMode?: BrushRegionMode;
  category?: "floor" | "terrainWater";
  editing?: boolean;
}>();

const emit = defineEmits<{
  "update:regionMode": [mode: BrushRegionMode];
  "update:category": [category: "floor" | "terrainWater"];
  "update:wallMode": [mode: GroundWallMode];
  "update:name": [name: string];
  delete: [];
}>();

function rename(value: string | number | undefined): void {
  if (value !== undefined && selected) emit("update:name", String(value));
}

const shapeOptions = computed(() => [
  { value: "new" as const, label: "New shape" },
  { value: "extend" as const, label: "Extend selected", disabled: selected === null },
]);
const CATEGORY_OPTIONS = [
  { value: "floor" as const, label: "Floor" },
  { value: "terrainWater" as const, label: "Water" },
];
const WALL_OPTIONS = [
  { value: "none" as const, label: "None" },
  { value: "visible" as const, label: "Visible" },
  { value: "hidden" as const, label: "Hidden" },
];
const WALL_HINTS: Record<GroundWallMode, string> = {
  none: "An open boundary. Move through it and see across it.",
  visible: "A drawn wall that blocks sight and movement.",
  hidden: "An unseen wall that blocks sight and movement.",
};
</script>
