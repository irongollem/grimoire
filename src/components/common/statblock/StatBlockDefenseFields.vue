<template>
  <label v-for="d in DEFENSE_FIELDS" :key="d.field" class="block">
    <span class="block text-label-lg font-semibold text-muted-foreground mb-1">{{ d.label }}</span>
    <AppInput
      v-model.lazy="texts[d.field].value"
      tone="filled"
      size="body"
      :placeholder="d.placeholder"
    />
  </label>
  <p
    v-if="model.notes"
    class="col-span-full flex flex-wrap items-center gap-x-2 text-caption text-muted-foreground"
  >
    <span>Kept as a note: {{ model.notes }}</span>
    <AppButton variant="link" size="inline-xs" label="Clear note" @click="model = { ...model, notes: undefined }" />
  </p>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import { type DefenseField, applyDefenseText, defenseText } from "@/lib/statBlock/defenseFields";
import type { Defenses } from "@/types/statBlock.types";

/**
 * The four defense fields of a stat block (#1017). Each is text the DM types
 * ("fire; bludgeoning from nonmagical attacks"); on commit that one field is
 * parsed back into its typed category and re-shown in canonical wording. Words
 * the parser cannot place are kept as a note rather than dropped.
 *
 * Renders into the parent's grid: the four labels, then the note line.
 */
const model = defineModel<Defenses>({ required: true });

const DEFENSE_FIELDS: Array<{ field: DefenseField; label: string; placeholder: string }> = [
  { field: "vulnerabilities", label: "Damage Vulnerabilities", placeholder: "bludgeoning" },
  { field: "resistances", label: "Damage Resistances", placeholder: "fire, cold" },
  { field: "immunities", label: "Damage Immunities", placeholder: "poison, psychic" },
  { field: "condition_immunities", label: "Condition Immunities", placeholder: "charmed, exhaustion" },
];

const texts = Object.fromEntries(
  DEFENSE_FIELDS.map(({ field }) => [
    field,
    computed({
      get: () => defenseText(model.value, field),
      set: (raw: string) => {
        model.value = applyDefenseText(model.value, field, raw);
      },
    }),
  ]),
) as Record<DefenseField, ReturnType<typeof computed<string>>>;
</script>
