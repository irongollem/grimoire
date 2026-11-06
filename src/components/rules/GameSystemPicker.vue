<template>
  <!--
    The game system choice (#934): New Campaign offers every system, a campaign's
    Rules tab only the ones its system is compatible with. Cards are
    CardRadioGroup's, as the edition picker's are.
  -->
  <CardRadioGroup
    :model-value="modelValue"
    :options="cards"
    :disabled="disabled"
    :label="label"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import { computed } from "vue";
import CardRadioGroup from "@/components/common/controls/CardRadioGroup.vue";
import { listGameSystems, type GameSystemKey } from "@/systems/registry";

const { modelValue, only, disabled = false, label = "Game system" } = defineProps<{
  /** Null while nothing is chosen yet: a new campaign has no system until its DM picks one. */
  modelValue: GameSystemKey | null;
  /** Offer only these systems; every system when omitted. */
  only?: readonly GameSystemKey[];
  disabled?: boolean;
  label?: string;
}>();

const emit = defineEmits<{ "update:modelValue": [value: GameSystemKey] }>();

const cards = computed(() =>
  listGameSystems()
    .filter((system) => only === undefined || only.includes(system.key))
    .map((system) => ({ value: system.key, label: system.label, description: system.description })),
);
</script>
