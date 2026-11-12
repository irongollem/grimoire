<template>
  <div class="flex flex-col gap-4 p-4" data-testid="crop-panel">
    <p class="text-caption text-muted-foreground">Drag the box to choose what to keep. Every other edit works on the part you keep.</p>

    <PanelField label="Shape">
      <SegmentedControl :model-value="shape" :options="options" size="xs" wrap @update:model-value="emit('shape', $event)" />
    </PanelField>

    <p class="text-caption tabular-nums text-muted-foreground" data-testid="crop-kept">{{ kept }}</p>

    <AppButton variant="ghost" size="sm" :icon="IconUndo" label="Reset crop" :disabled="!cropped" data-testid="crop-reset" @click="emit('reset')" />
  </div>
</template>

<script setup lang="ts">
/** The Crop tool's panel (#1176 story 9c): the shape the box keeps, and a way back to the whole picture. */
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import SegmentedControl, { type SegmentedOption } from "@/components/common/controls/SegmentedControl.vue";
import PanelField from "@/scriptorium/components/panel/PanelField.vue";
import type { CropRect, CropShape } from "@/scriptorium/illuminator/lib/cropBox";
import { IconUndo } from "@/lib/icons";

const { shape, crop, pageAspect } = defineProps<{
  shape: CropShape;
  crop: CropRect;
  /** The page's shape, for art placed on the page; null for a picture in the text, which has no Page shape. */
  pageAspect: number | null;
}>();

const emit = defineEmits<{ shape: [value: CropShape]; reset: [] }>();

const options = computed<SegmentedOption<CropShape>[]>(() => [
  { value: "free", label: "Free" },
  { value: "1:1", label: "1:1" },
  { value: "4:3", label: "4:3" },
  { value: "3:2", label: "3:2" },
  { value: "16:9", label: "16:9" },
  ...(pageAspect !== null ? [{ value: "page" as const, label: "Page", tooltip: "The shape of the page, to fill it" }] : []),
]);

const cropped = computed(() => crop.w < 0.9999 || crop.h < 0.9999);
const kept = computed(() => (cropped.value ? `Keeping ${Math.round(crop.w * 100)}% across and ${Math.round(crop.h * 100)}% down.` : "Keeping the whole picture."));
</script>
