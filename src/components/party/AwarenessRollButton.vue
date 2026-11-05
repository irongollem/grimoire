<template>
  <AppButton
    variant="tinted"
    :tone="tone"
    :emphasis="roll ? 'soft' : 'outline'"
    :size="size"
    :loading="pending"
    :tooltip="description"
    :aria-label="description"
    :label="label"
    @click="emit('use')"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { explainAwareness, readAwareness, type AwarenessSource } from "@/rules/awareness";
import type { AwarenessRoll } from "@/types/party.types";

const { member, roll, size = "xs", pending = false } = defineProps<{
  member: AwarenessSource;
  roll: AwarenessRoll | undefined;
  size?: "inline-xs" | "xs" | "sm";
  pending?: boolean;
}>();
const emit = defineEmits<{ use: [] }>();

const dice = computed(() => (roll ? { d20: roll.d20, d20Second: roll.d20_second } : null));
const reading = computed(() => (dice.value ? readAwareness(member, dice.value) : null));
const tone = computed(() => (reading.value?.die === 20 ? "success" : reading.value?.die === 1 ? "danger" : "arcane"));
const label = computed(() => (reading.value ? String(reading.value.total) : "Roll"));
const description = computed(() => {
  if (!roll || !dice.value || !reading.value) {
    return "No awareness roll yet. Click to roll the first one for the next Perception check.";
  }
  const lastDice =
    roll.last_used_d20 !== null && roll.last_used_d20_second !== null
      ? { d20: roll.last_used_d20, d20Second: roll.last_used_d20_second }
      : null;
  const last = lastDice ? ` Last used ${readAwareness(member, lastDice).total}.` : "";
  return `Awareness roll ${reading.value.total} (${explainAwareness(dice.value, reading.value)}).${last} Click when a Perception check is due: it is used and the next is rolled.`;
});
</script>
