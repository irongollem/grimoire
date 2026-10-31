<template>
  <!-- The editor's three tabs (Map Table frame 18). Fog and tokens are play-only and have no tab here. Each
       tab shows its key after the word; the digits work anywhere on the page but a text field. -->
  <div role="group" aria-label="Map layer" class="inline-flex shrink-0 items-center gap-1">
    <AppButton
      v-for="tab in LAYER_TABS"
      :key="tab.value"
      variant="subtle"
      size="xs"
      :active="modelValue === tab.value"
      :aria-pressed="modelValue === tab.value"
      :tooltip="tab.tooltip"
      @click="emit('update:modelValue', tab.value)"
    >
      <span>{{ tab.label }}</span>
      <span class="ml-1.5 text-caption-sm tabular-nums text-muted-foreground" aria-hidden="true">{{ tab.key }}</span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { EditorLayer } from "@/cartographer/keymap";

defineProps<{ modelValue: EditorLayer }>();

const emit = defineEmits<{ "update:modelValue": [layer: EditorLayer] }>();

// Words a DM reads: Base image, Drawing, Zoning. The values are the code names the editor keeps; the keys are
// `LAYER_KEYS` in keymap.ts, in the order drawn here.
const LAYER_TABS: { value: EditorLayer; label: string; key: string; tooltip: string }[] = [
  { value: "picture", label: "Base image", key: "1", tooltip: "Base image (1): the scan or render under everything. Add it, line its grid up, remove it." },
  { value: "drawing", label: "Drawing", key: "2", tooltip: "Drawing (2): the map itself. Paint floors, walls, doors and objects on the grid." },
  { value: "plan", label: "Zoning", key: "3", tooltip: "Zoning (3): zones on the map. Most rooms are found from the walls; name them and link each to its place." },
];
</script>
