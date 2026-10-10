<template>
  <div class="flex flex-col gap-3">
    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Name on the sheet">
        <AppInput :model-value="uses.label" tone="card" size="body" placeholder="Rage, Focus Points, Lay on Hands…" @update:model-value="setLabel(String($event))" />
      </MechField>
      <MechField label="Key" hint="What the spent count is saved under. Keep it the same across editions of the same idea.">
        <AppInput :model-value="uses.key" tone="card" size="body" placeholder="rage" @update:model-value="emit('update:uses', { ...uses, key: String($event) })" />
      </MechField>
    </div>

    <UsesAmountEditor :amount="uses.amount" @update:amount="emit('update:uses', { ...uses, amount: $event })" />

    <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <MechField label="Comes back on">
        <AppSelect :model-value="uses.recharge" tone="card" size="body" weight="normal" block @update:model-value="setRecharge($event)">
          <option v-for="r in RECHARGES" :key="r" :value="r">{{ RECHARGE_LABELS[r] }}</option>
        </AppSelect>
      </MechField>
      <MechField v-if="uses.recharge === 'long'" label="Short rest gives back" hint="Uses regained on a short rest. Leave 0 for none.">
        <AppInput :model-value="uses.short_rest_regain ?? 0" type="number" tone="card" size="body" min="0" @update:model-value="setRegain(Number($event))" />
      </MechField>
    </div>

    <div v-if="uses.recharge_from" class="grid grid-cols-2 gap-3 items-end">
      <MechField label="From level">
        <AppInput :model-value="uses.recharge_from.level" type="number" tone="card" size="body" min="1" max="20" @update:model-value="setFrom({ level: Number($event), recharge: uses.recharge_from.recharge })" />
      </MechField>
      <MechField label="Then comes back on">
        <AppSelect :model-value="uses.recharge_from.recharge" tone="card" size="body" weight="normal" block @update:model-value="setFrom({ level: uses.recharge_from.level, recharge: $event })">
          <option v-for="r in RECHARGES" :key="r" :value="r">{{ RECHARGE_LABELS[r] }}</option>
        </AppSelect>
      </MechField>
      <div class="col-span-2">
        <AppButton variant="ghost" tone="danger" size="xs" :icon="IconDelete" icon-size="xs" label="Remove the later change" @click="setFrom(undefined)" />
      </div>
    </div>
    <div v-else>
      <AppButton variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Recharge changes at a later level" @click="setFrom({ level: 5, recharge: 'short' })" />
    </div>

    <AppCheckbox
      :model-value="uses.pool"
      label="A pool spent in chosen amounts (Lay on Hands, Ki), not one use at a time"
      label-role="caption"
      @update:model-value="emit('update:uses', { ...uses, pool: $event })"
    />
  </div>
</template>

<script setup lang="ts">
import { IconAdd, IconDelete } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import { RECHARGES, type FeatureUses, type Recharge } from "@/rules/features/mechanics.types";
import MechField from "./MechField.vue";
import UsesAmountEditor from "./UsesAmountEditor.vue";

const { uses } = defineProps<{ uses: FeatureUses }>();
const emit = defineEmits<{ "update:uses": [value: FeatureUses] }>();

const RECHARGE_LABELS: Record<Recharge, string> = {
  short: "A short rest",
  long: "A long rest",
  turn: "The start of your turn",
  dawn: "Dawn",
};

/** A key typed by nobody follows the name, so the common case is one field to fill. */
function slug(label: string): string {
  return label.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function setLabel(label: string) {
  const followed = uses.key === "" || uses.key === slug(uses.label);
  emit("update:uses", { ...uses, label, key: followed ? slug(label) : uses.key });
}

function setRecharge(recharge: Recharge) {
  const { short_rest_regain: _regain, ...rest } = uses;
  emit("update:uses", recharge === "long" ? { ...uses, recharge } : { ...rest, recharge });
}

function setRegain(n: number) {
  const { short_rest_regain: _regain, ...rest } = uses;
  emit("update:uses", n > 0 ? { ...uses, short_rest_regain: n } : rest);
}

function setFrom(next: { level: number; recharge: Recharge } | undefined) {
  const { recharge_from: _from, ...rest } = uses;
  emit("update:uses", next ? { ...rest, recharge_from: next } : rest);
}
</script>
