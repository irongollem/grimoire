<template>
  <div class="grid grid-cols-3 gap-2" role="group" :aria-label="label">
    <AppButton
      v-for="ability in allowed"
      :key="ability"
      variant="subtle"
      size="body"
      block
      :active="selected.includes(ability)"
      :disabled="isFull(ability)"
      :aria-label="`${NAMES[ability]} ${scores[ability]}`"
      class="flex-col gap-0.5 py-2"
      @click="toggle(ability)"
    >
      <span class="text-label">{{ ability.toUpperCase() }}</span>
      <span class="text-title font-bold tabular-nums">{{ scores[ability] }}</span>
      <span class="text-caption" :class="selected.includes(ability) ? 'text-primary' : 'text-transparent'">
        +{{ bonusAt(ability) }} to {{ afterAt(ability) }}
      </span>
    </AppButton>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import type { AbilityKey } from "@/rules/characterCreation";
import type { AbilityPick } from "./choiceValue";

const NAMES: Record<AbilityKey, string> = {
  str: "Strength",
  dex: "Dexterity",
  con: "Constitution",
  int: "Intelligence",
  wis: "Wisdom",
  cha: "Charisma",
};

const { scores, allowed, single, pair, max, label, modelValue } = defineProps<{
  scores: Record<AbilityKey, number>;
  allowed: readonly AbilityKey[];
  /** What one chosen ability gains. */
  single: number;
  /** What each of two chosen abilities gains; null when only one may be chosen. */
  pair: number | null;
  /** A score is not raised past this. */
  max: number;
  label: string;
  modelValue: AbilityPick;
}>();

const emit = defineEmits<{ "update:modelValue": [value: AbilityPick] }>();

const selected = computed(() =>
  [modelValue.primary, modelValue.secondary].filter((a): a is AbilityKey => a !== null),
);

function bonusAt(ability: AbilityKey): number {
  if (!selected.value.includes(ability)) return 0;
  return selected.value.length === 2 && pair !== null ? pair : single;
}

function afterAt(ability: AbilityKey): number {
  return Math.min(max, scores[ability] + bonusAt(ability));
}

// A score already at the cap cannot be picked, but one already picked stays pickable so it can be undone.
function isFull(ability: AbilityKey): boolean {
  return scores[ability] >= max && !selected.value.includes(ability);
}

function toggle(ability: AbilityKey) {
  const current = selected.value;
  let next: AbilityKey[];
  if (current.includes(ability)) next = current.filter((a) => a !== ability);
  else if (pair === null) next = [ability];
  else next = current.length < 2 ? [...current, ability] : [current[0], ability];
  emit("update:modelValue", { primary: next[0] ?? null, secondary: next[1] ?? null });
}
</script>
