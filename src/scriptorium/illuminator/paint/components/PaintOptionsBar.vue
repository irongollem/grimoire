<template>
  <div
    class="flex flex-wrap items-center gap-x-4 gap-y-2 border-b border-border bg-card px-3 py-2"
    role="toolbar"
    :aria-label="`${TOOL_LABEL[tool]} options`"
  >
    <span class="text-label-lg font-bold uppercase text-foreground">{{ TOOL_LABEL[tool] }}</span>

    <AppButton
      v-if="tool !== 'picker'"
      variant="outline"
      size="xs"
      data-testid="brush-chip"
      aria-label="Open the brush library"
      @click="emit('open-library')"
    >
      <span class="flex h-5 w-8 items-center justify-center overflow-hidden rounded-sm bg-muted">
        <slot name="tip" />
      </span>
      <span class="max-w-[8rem] truncate">{{ brushName }}</span>
    </AppButton>

    <p v-if="tool === 'picker'" class="text-caption text-muted-foreground" data-testid="picker-hint">{{ PICKER_HINT }}</p>

    <label v-if="fields.includes('mode')" class="flex items-center gap-2">
      <span class="text-eyebrow text-muted-foreground">Mode</span>
      <AppSelect
        size="xs"
        aria-label="Blend mode"
        :model-value="mode"
        @update:model-value="emit('update:mode', $event as BrushBlend)"
      >
        <option v-for="m in BRUSH_MODES" :key="m.value" :value="m.value">{{ m.label }}</option>
      </AppSelect>
    </label>

    <PaintSlider
      v-if="fields.includes('size')"
      label="Size"
      :model-value="values.size"
      :display="`${Math.round(values.size)} px`"
      :min="1"
      :max="400"
      :step="1"
      @update:model-value="emit('change', 'size', $event)"
    />
    <PaintSlider
      v-if="fields.includes('opacity')"
      label="Opacity"
      :model-value="values.opacity"
      :display="percent(values.opacity)"
      @update:model-value="emit('change', 'opacity', $event)"
    />
    <PaintSlider
      v-if="fields.includes('flow')"
      label="Flow"
      :model-value="values.flow"
      :display="percent(values.flow)"
      @update:model-value="emit('change', 'flow', $event)"
    />
    <PaintSlider
      v-if="fields.includes('smoothing')"
      label="Smoothing"
      :model-value="values.smoothing"
      :display="percent(values.smoothing)"
      @update:model-value="emit('change', 'smoothing', $event)"
    />

    <AppButton
      v-if="tool !== 'picker'"
      class="ml-auto"
      variant="ghost"
      size="xs"
      label="Brush settings"
      @click="emit('open-settings')"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import PaintSlider from "./PaintSlider.vue";
import type { BrushBlend } from "../engine/types";
import type { PaintTool } from "../session/types";
import { BRUSH_MODES, PICKER_HINT, TOOL_LABEL, visibleFields, type OptionField } from "./optionsFields";

/**
 * The strip across the top of the stage for the armed tool (frames 02 and 09). Presentational: the values shown
 * are the effective ones (an override, else the brush's own); a change names the field and its new value
 * (size in pixels, the rest as 0 to 1 fractions).
 */
const { tool, brushName, mode, values } = defineProps<{
  tool: PaintTool;
  brushName: string;
  mode: BrushBlend;
  values: { size: number; opacity: number; flow: number; smoothing: number };
}>();

const emit = defineEmits<{
  (e: "change", field: Exclude<OptionField, "mode">, value: number): void;
  (e: "update:mode", value: BrushBlend): void;
  (e: "open-library"): void;
  (e: "open-settings"): void;
}>();

const fields = computed(() => visibleFields(tool));
const percent = (n: number) => `${Math.round(n * 100)}%`;
</script>
