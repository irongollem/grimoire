<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Name on the sheet">
        <AppInput :model-value="toggle.label" tone="card" size="body" placeholder="Raging" @update:model-value="setLabel(String($event))" />
      </MechField>
      <MechField label="Key" hint="Riders that wait on this toggle point at it.">
        <AppInput :model-value="toggle.key" tone="card" size="body" placeholder="raging" @update:model-value="emit('update:toggle', { ...toggle, key: String($event) })" />
      </MechField>
    </div>
    <MechField label="Ends by itself on">
      <AppSelect :model-value="toggle.ends_on" tone="card" size="body" weight="normal" block @update:model-value="emit('update:toggle', { ...toggle, ends_on: $event })">
        <option value="short_rest">A short rest</option>
        <option value="long_rest">A long rest</option>
      </AppSelect>
    </MechField>
    <UsesCostFields :cost="toggle.spends" add-label="Switching it on spends uses" @update:cost="setSpends($event)" />
  </div>
</template>

<script setup lang="ts">
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { FeatureToggle, UsesCost } from "@/rules/features/mechanics.types";
import MechField from "./MechField.vue";
import UsesCostFields from "./UsesCostFields.vue";

const { toggle } = defineProps<{ toggle: FeatureToggle }>();
const emit = defineEmits<{ "update:toggle": [value: FeatureToggle] }>();

function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function setLabel(label: string) {
  const followed = toggle.key === "" || toggle.key === slug(toggle.label);
  emit("update:toggle", { ...toggle, label, key: followed ? slug(label) : toggle.key });
}

function setSpends(cost: UsesCost | undefined) {
  const { spends: _spends, ...rest } = toggle;
  emit("update:toggle", cost ? { ...rest, spends: cost } : rest);
}
</script>
