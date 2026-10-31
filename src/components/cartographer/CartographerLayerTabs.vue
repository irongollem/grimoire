<template>
  <!-- The editor's three tabs (Map Table frame 18). Fog and tokens are play-only and have no tab here. Each
       key is in its tooltip, and the digits work anywhere on the page but a text field. -->
  <SegmentedControl
    :model-value="modelValue"
    :options="LAYER_TABS"
    size="xs"
    class="shrink-0"
    aria-label="Map layer"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import type { EditorLayer } from "@/cartographer/keymap";

defineProps<{ modelValue: EditorLayer }>();

const emit = defineEmits<{ "update:modelValue": [layer: EditorLayer] }>();

// Words a DM reads: Base image, Drawing, Zoning. The values are the code names the editor keeps.
const LAYER_TABS: SegmentedOption<EditorLayer>[] = [
  { value: "picture", label: "Base image", tooltip: "Base image (1): the scan or render under everything. Add it, line its grid up, remove it." },
  { value: "drawing", label: "Drawing", tooltip: "Drawing (2): the map itself. Paint floors, walls, doors and objects on the grid." },
  { value: "plan", label: "Zoning", tooltip: "Zoning (3): outline each room and link it to its place, so the map knows which room is which." },
];
</script>
