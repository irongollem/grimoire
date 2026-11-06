<template>
  <!--
    The one place a 5e edition is chosen: the character wizard's first step and
    a character's own edition (#943). The cards are CardRadioGroup's.
  -->
  <CardRadioGroup
    :model-value="modelValue"
    :options="RULESET_OPTIONS"
    :disabled="disabled"
    :label="label"
    :notes="notes"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>

<script setup lang="ts">
import CardRadioGroup from "@/components/common/controls/CardRadioGroup.vue";
import { RULESET_OPTIONS, type RulesetKey } from "@/types/ruleset.types";

const { modelValue, disabled = false, label = "Rules edition", notes } = defineProps<{
  /** Null while nothing is chosen yet: a new character has no edition until its player picks one. */
  modelValue: RulesetKey | null;
  disabled?: boolean;
  /** Names the group for assistive tech. */
  label?: string;
  /** A line under one option that is specific to where the picker is shown, such as "Your table plays this." */
  notes?: Partial<Record<RulesetKey, string>>;
}>();

const emit = defineEmits<{ "update:modelValue": [value: RulesetKey] }>();
</script>
