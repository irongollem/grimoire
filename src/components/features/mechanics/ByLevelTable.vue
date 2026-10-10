<template>
  <div class="flex flex-col gap-2">
    <div v-for="(row, i) in rows" :key="i" class="flex items-center gap-2">
      <label class="w-20 shrink-0">
        <span class="sr-only">Level</span>
        <AppInput
          :model-value="row.level"
          type="number"
          tone="card"
          size="body"
          min="1"
          max="20"
          placeholder="Level"
          @update:model-value="setCell(i, 'level', String($event))"
        />
      </label>
      <label class="flex-1 min-w-0">
        <span class="sr-only">{{ valueLabel }}</span>
        <AppInput
          :model-value="row.value"
          :type="numeric ? 'number' : 'text'"
          tone="card"
          size="body"
          :placeholder="valueLabel"
          @update:model-value="setCell(i, 'value', String($event))"
        />
      </label>
      <AppButton
        variant="ghost"
        tone="danger"
        size="icon-sm"
        :icon="IconDelete"
        icon-size="xs"
        aria-label="Remove level"
        @click="removeRow(i)"
      />
    </div>
    <div>
      <AppButton variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Add level" @click="addRow" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, watch } from "vue";
import { IconAdd, IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { deepEqual } from "@/lib/utils";
import { nextLevel, recordFromRows, rowsFromRecord, type LevelRow } from "./byLevelRows";

/**
 * A level-to-value table ("at level 5 the value is 3d6"). The rows are kept
 * locally so a half-typed level does not rename or drop the row being edited;
 * the model only ever holds the complete rows.
 */
const { numeric = false, valueLabel = "Value" } = defineProps<{
  /** Values are numbers (the parent converts); changes the input type only. */
  numeric?: boolean;
  valueLabel?: string;
}>();

const model = defineModel<Record<string, string>>({ required: true });

const rows = ref<LevelRow[]>(rowsFromRecord(model.value));

watch(model, (next) => {
  // Our own emit comes back through the prop; only a different record is an outside change.
  if (!deepEqual(recordFromRows(rows.value), next)) rows.value = rowsFromRecord(next);
});

function commit() {
  model.value = recordFromRows(rows.value);
}

function setCell(index: number, field: keyof LevelRow, value: string) {
  rows.value = rows.value.map((row, i) => (i === index ? { ...row, [field]: value } : row));
  commit();
}

function addRow() {
  rows.value = [...rows.value, { level: nextLevel(rows.value), value: "" }];
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, i) => i !== index);
  commit();
}
</script>
