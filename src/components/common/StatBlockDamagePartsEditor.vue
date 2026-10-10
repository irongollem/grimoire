<template>
  <div class="flex flex-col gap-1.5">
    <div v-for="(part, i) in model" :key="i" class="flex items-center gap-2">
      <AppInput
        :model-value="part.dice"
        tone="filled"
        size="body"
        placeholder="2d6+3"
        :aria-label="`${label} dice ${i + 1}`"
        class="w-28"
        :block="false"
        @update:model-value="(v) => patch(i, { dice: String(v).replace(/\s+/g, '') })"
      />
      <AppSelect
        :model-value="part.type ?? ''"
        tone="filled"
        size="body"
        :aria-label="`${label} damage type ${i + 1}`"
        @update:model-value="(v) => patch(i, { type: toType(v) })"
      >
        <option value="">No type</option>
        <option v-for="t in DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
      </AppSelect>
      <AppButton
        variant="ghost"
        tone="danger"
        size="inline-xs"
        icon-size="md"
        :icon="IconClose"
        class="shrink-0"
        :aria-label="`Remove ${label.toLowerCase()} part`"
        @click="remove(i)"
      />
    </div>
    <AppButton variant="link" size="inline" class="self-start" label="+ Add damage" @click="add" />
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { IconClose } from "@/lib/icons";
import { DAMAGE_TYPES, type DamageType } from "@/types/damage.types";
import type { DamagePart } from "@/types/statBlock.types";

defineProps<{ label: string }>();

/** Rows of dice plus damage type: a hit's damage, or a failed save's. */
const model = defineModel<DamagePart[]>({ required: true });

function toType(v: string | number | null | undefined): DamageType | null {
  return DAMAGE_TYPES.find((t) => t === v) ?? null;
}

function patch(i: number, change: Partial<DamagePart>) {
  model.value = model.value.map((p, j) => (j === i ? { ...p, ...change } : p));
}

function add() {
  model.value = [...model.value, { dice: "", type: null }];
}

function remove(i: number) {
  model.value = model.value.filter((_, j) => j !== i);
}
</script>
