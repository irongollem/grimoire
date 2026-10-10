<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Name">
        <AppInput :model-value="action.name" tone="card" size="body" placeholder="Dash, Disengage…" @update:model-value="emit('update:action', { ...action, name: String($event) })" />
      </MechField>
      <MechField label="Takes">
        <AppSelect :model-value="action.activation" tone="card" size="body" weight="normal" block @update:model-value="emit('update:action', { ...action, activation: $event })">
          <option v-for="a in ACTIVATIONS" :key="a" :value="a">{{ ACTIVATION_LABELS[a] }}</option>
        </AppSelect>
      </MechField>
    </div>
    <UsesCostFields :cost="action.spends" @update:cost="setSpends($event)" />
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { ACTIVATIONS, type SubAction, type UsesCost } from "@/rules/features/mechanics.types";
import { ACTIVATION_LABELS } from "@/types/feature.types";
import MechField from "./MechField.vue";
import UsesCostFields from "./UsesCostFields.vue";

const { action } = defineProps<{ action: SubAction }>();
const emit = defineEmits<{ "update:action": [value: SubAction] }>();

function setSpends(cost: UsesCost | undefined) {
  const { spends: _spends, ...rest } = action;
  emit("update:action", cost ? { ...rest, spends: cost } : rest);
}
</script>
