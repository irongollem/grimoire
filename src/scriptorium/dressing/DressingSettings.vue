<template>
  <div class="space-y-2">
    <span class="block text-caption text-muted-foreground">Page dressing</span>
    <div v-for="row in ROWS" :key="row.id" class="space-y-1">
      <AppCheckbox :label="row.label" :model-value="part(row.id).on" @update:model-value="setOn(row.id, $event)" />
      <div v-if="part(row.id).on" class="pl-7">
        <PanelRange
          label="Strength"
          :model-value="Math.round(part(row.id).strength * 100)"
          :min="10"
          :max="100"
          @update:model-value="setStrength(row.id, $event / 100)"
        />
      </div>
    </div>
    <AppButton variant="subtle" size="sm" :icon="IconShuffle" label="Shuffle" :disabled="!modelValue" @click="shuffle" />
    <p class="text-caption text-muted-foreground">
      Hand-painted marks on every page, a little different on each. Shuffle moves them and keeps your choices. Ink-friendly prints none.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The Page dressing block of the book settings (#1181): which marks the pages carry and how strong. It edits the
 * dressing value and nothing else; the settings' autosave writes it. Switching the last part off empties the
 * column (null), so a book with no dressing stores none.
 */
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import { IconShuffle } from "@/lib/icons";
import PanelRange from "@/scriptorium/components/panel/PanelRange.vue";
import {
  emptyDressing,
  isBare,
  newSeed,
  type Dressing,
  type DressingPart,
  type DressingPartId,
} from "@/scriptorium/dressing/dressing";

const { modelValue } = defineProps<{ modelValue: Dressing | null }>();
const emit = defineEmits<{ "update:modelValue": [value: Dressing | null] }>();

const ROWS: { id: DressingPartId; label: string }[] = [
  { id: "stain", label: "Stain low on the page" },
  { id: "wash", label: "Wash along the edge" },
  { id: "corners", label: "Corners" },
];

/** What a row shows: the part as saved, or an off part at its starting strength. */
function part(id: DressingPartId): DressingPart {
  return modelValue?.[id] ?? emptyDressing(0)[id];
}

function change(id: DressingPartId, next: Partial<DressingPart>) {
  const base = modelValue ?? emptyDressing(newSeed());
  const dressing: Dressing = { ...base, [id]: { ...base[id], ...next } };
  emit("update:modelValue", isBare(dressing) ? null : dressing);
}

const setOn = (id: DressingPartId, on: boolean) => change(id, { on });
const setStrength = (id: DressingPartId, strength: number) => change(id, { strength });

function shuffle() {
  if (modelValue) emit("update:modelValue", { ...modelValue, seed: newSeed() });
}
</script>
