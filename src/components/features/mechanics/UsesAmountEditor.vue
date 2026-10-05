<template>
  <div class="flex flex-col gap-3">
    <MechField :label="label">
      <AppSelect :model-value="amount.kind" tone="card" size="body" weight="normal" block @update:model-value="setKind($event)">
        <option v-for="k in kinds" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </MechField>

    <MechField v-if="amount.kind === 'fixed'" label="Number">
      <AppInput :model-value="amount.value" type="number" tone="card" size="body" min="0" @update:model-value="emit('update:amount', { kind: 'fixed', value: Number($event) })" />
    </MechField>

    <template v-else-if="amount.kind === 'by_level'">
      <p class="text-caption text-muted-foreground">List the levels where the number changes; a level reads the nearest one at or below it.</p>
      <ByLevelTable
        :model-value="stringsFromNumbers(amount.values)"
        numeric
        value-label="Uses"
        @update:model-value="emit('update:amount', { kind: 'by_level', values: numbersFromStrings($event) })"
      />
    </template>

    <p v-else-if="amount.kind === 'proficiency'" class="text-caption text-muted-foreground">Equal to the character's proficiency bonus.</p>

    <div v-else-if="amount.kind === 'ability_mod'" class="grid grid-cols-3 gap-2">
      <MechField label="Ability">
        <AppSelect :model-value="amount.ability" tone="card" size="body" weight="normal" block @update:model-value="emit('update:amount', { ...amount, ability: $event })">
          <option v-for="key in ABILITY_KEYS" :key="key" :value="key">{{ ABILITY_LABELS[key] }}</option>
        </AppSelect>
      </MechField>
      <MechField label="Never below">
        <AppInput :model-value="amount.min" type="number" tone="card" size="body" min="0" @update:model-value="emit('update:amount', { ...amount, min: Number($event) })" />
      </MechField>
      <MechField label="Plus">
        <AppInput :model-value="amount.bonus ?? 0" type="number" tone="card" size="body" @update:model-value="setBonus(Number($event))" />
      </MechField>
    </div>

    <MechField v-else-if="amount.kind === 'class_level'" label="Times the class level">
      <AppInput :model-value="amount.multiplier" type="number" tone="card" size="body" min="1" @update:model-value="emit('update:amount', { kind: 'class_level', multiplier: Number($event) })" />
    </MechField>

    <template v-else>
      <MechField label="Unlimited from level">
        <AppInput :model-value="amount.level" type="number" tone="card" size="body" min="1" max="20" @update:model-value="emit('update:amount', { ...amount, level: Number($event) })" />
      </MechField>
      <div class="rounded-md border border-border p-3">
        <UsesAmountEditor
          label="Below that level"
          :amount="amount.below"
          :allow-unlimited="false"
          @update:amount="(below) => emit('update:amount', { ...amount, below: below as BelowAmount })"
        />
      </div>
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import { ABILITY_KEYS, ABILITY_LABELS } from "@/types/card.types";
import type { UsesAmount } from "@/rules/features/mechanics.types";
import { AMOUNT_KINDS, amountOfKind } from "./mechanicsDraft";
import { numbersFromStrings, stringsFromNumbers } from "./byLevelRows";
import ByLevelTable from "./ByLevelTable.vue";
import MechField from "./MechField.vue";
// Recursive: an "unlimited from level N" amount holds the amount below that level.
import UsesAmountEditor from "./UsesAmountEditor.vue";

type BelowAmount = Exclude<UsesAmount, { kind: "unlimited_from" }>;

const { amount, label = "How many uses", allowUnlimited = true } = defineProps<{
  amount: UsesAmount;
  label?: string;
  /** False for the amount below an "unlimited from" level, which cannot itself be unlimited. */
  allowUnlimited?: boolean;
}>();
const emit = defineEmits<{ "update:amount": [value: UsesAmount] }>();

const kinds = computed(() => AMOUNT_KINDS.filter((k) => allowUnlimited || k.value !== "unlimited_from"));

function setKind(kind: UsesAmount["kind"]) {
  if (kind !== amount.kind) emit("update:amount", amountOfKind(kind));
}

function setBonus(bonus: number) {
  if (amount.kind !== "ability_mod") return;
  const { bonus: _previous, ...rest } = amount;
  emit("update:amount", bonus === 0 ? rest : { ...rest, bonus });
}
</script>
