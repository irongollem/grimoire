<template>
  <div v-if="cost" class="flex flex-wrap items-end gap-2">
    <MechField label="Spends from the pool with key" class="flex-1 min-w-40">
      <AppInput
        :model-value="cost.key"
        tone="card"
        size="body"
        placeholder="e.g. ki, bardic_inspiration"
        @update:model-value="emit('update:cost', { ...cost, key: String($event) })"
      />
    </MechField>
    <MechField label="Amount" class="w-24">
      <AppInput
        :model-value="cost.amount"
        type="number"
        tone="card"
        size="body"
        min="1"
        @update:model-value="emit('update:cost', { ...cost, amount: Number($event) })"
      />
    </MechField>
    <AppButton variant="ghost" tone="danger" size="icon-sm" :icon="IconDelete" icon-size="xs" aria-label="Remove cost" @click="emit('update:cost', undefined)" />
  </div>
  <div v-else>
    <AppButton variant="outline" size="sm" :icon="IconAdd" icon-size="xs" :label="addLabel" @click="emit('update:cost', { key: '', amount: 1 })" />
  </div>
</template>

<script setup lang="ts">
import { IconAdd, IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import type { UsesCost } from "@/rules/features/mechanics.types";
import MechField from "./MechField.vue";

/** What something spends from a pool: the pool's key and how many. Absent means free. */
const { addLabel = "Spends uses" } = defineProps<{ cost: UsesCost | undefined; addLabel?: string }>();
const emit = defineEmits<{ "update:cost": [value: UsesCost | undefined] }>();
</script>
