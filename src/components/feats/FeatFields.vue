<template>
  <div class="flex flex-col gap-4">
    <ul v-if="errors.length > 0" role="alert" class="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-body text-destructive list-disc list-inside">
      <li v-for="e in errors" :key="e">{{ e }}</li>
    </ul>

    <MechField v-if="ruleset === '2024'" label="Category">
      <AppSelect :model-value="fields.feat_category ?? ''" tone="card" size="body" weight="normal" block @update:model-value="setCategory($event)">
        <option value="">No category</option>
        <option v-for="c in FEAT_CATEGORIES" :key="c" :value="c">{{ FEAT_CATEGORY_LABELS[c] }}</option>
      </AppSelect>
    </MechField>

    <AppCheckbox :model-value="fields.repeatable" label="May be taken more than once" label-role="caption" @update:model-value="emit('update:fields', { ...fields, repeatable: $event })" />

    <MechSection title="Prerequisites" hint="What a character must meet to take it. Every condition you set has to hold." :removable="false">
      <MechField label="Character level at least">
        <AppInput :model-value="pre.level ?? ''" type="number" tone="card" size="body" min="1" max="20" placeholder="None" @update:model-value="setPre('level', numberOrNothing($event))" />
      </MechField>

      <fieldset class="flex flex-col gap-2">
        <legend class="text-eyebrow text-muted-foreground mb-1.5">An ability score of at least (any one of these)</legend>
        <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
          <MechField v-for="key in ABILITY_KEYS" :key="key" :label="ABILITY_LABELS[key] ?? key">
            <AppInput :model-value="pre.abilities?.any_of[key] ?? ''" type="number" tone="card" size="body" min="1" max="30" placeholder="-" @update:model-value="setAbilityScore(key, numberOrNothing($event))" />
          </MechField>
        </div>
      </fieldset>

      <MechField label="Armor training">
        <AppSelect :model-value="pre.armor ?? ''" tone="card" size="body" weight="normal" block @update:model-value="setArmor($event)">
          <option value="">None</option>
          <option v-for="a in ARMORS" :key="a.value" :value="a.value">{{ a.label }}</option>
        </AppSelect>
      </MechField>

      <AppCheckbox :model-value="pre.spellcasting === true" label="Can cast at least one spell" label-role="caption" @update:model-value="setPre('spellcasting', $event ? true : undefined)" />
      <AppCheckbox :model-value="pre.fighting_style_feature === true" label="Has the Fighting Style feature" label-role="caption" @update:model-value="setPre('fighting_style_feature', $event ? true : undefined)" />
    </MechSection>

    <MechSection v-if="fields.ability_increase" title="Ability score increase" @remove="emit('update:fields', { ...fields, ability_increase: null })">
      <fieldset class="flex flex-col gap-2">
        <legend class="text-eyebrow text-muted-foreground mb-1.5">Raises one of</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <AppCheckbox
            v-for="key in ABILITY_KEYS"
            :key="key"
            :model-value="fields.ability_increase.abilities.includes(key)"
            :label="ABILITY_LABELS[key] ?? key"
            label-role="caption"
            @update:model-value="toggleAbility(key, $event)"
          />
        </div>
      </fieldset>
      <div class="grid grid-cols-2 gap-3">
        <MechField label="By">
          <AppInput :model-value="fields.ability_increase.amount" type="number" tone="card" size="body" min="1" @update:model-value="setIncrease({ amount: Number($event) })" />
        </MechField>
        <MechField label="Not above">
          <AppInput :model-value="fields.ability_increase.max" type="number" tone="card" size="body" min="1" max="30" @update:model-value="setIncrease({ max: Number($event) })" />
        </MechField>
      </div>
      <AppCheckbox :model-value="fields.ability_increase.split" label="Or split as +1 to two abilities (the amount must be 2)" label-role="caption" @update:model-value="setIncrease({ split: $event })" />
    </MechSection>
    <div v-else>
      <AppButton variant="outline" size="sm" :icon="IconAdd" icon-size="xs" label="Add an ability score increase" @click="emit('update:fields', { ...fields, ability_increase: { abilities: ['str'], amount: 1, split: false, max: 20 } })" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import MechField from "@/components/features/mechanics/MechField.vue";
import MechSection from "@/components/features/mechanics/MechSection.vue";
import type { AbilityKey } from "@/rules/characterCreation";
import { FEAT_CATEGORIES, type FeatCategory, type FeatAbilityIncrease, type FeatPrerequisites } from "@/rules/features/mechanics.types";
import type { RulesetKey } from "@/types/ruleset.types";
import { ABILITY_KEYS, ABILITY_LABELS } from "@/types/card.types";
import { FEAT_CATEGORY_LABELS } from "@/types/feature.types";
import { ARMORS, numberOrNothing, withAbilityScore, type FeatFormFields } from "./featFields";

/** The feat-only half of the feature editor (#976): category, prerequisites, repeatable, ability increase. */
const { fields, ruleset, errors = [] } = defineProps<{
  fields: FeatFormFields;
  ruleset: RulesetKey | null;
  errors?: readonly string[];
}>();
const emit = defineEmits<{ "update:fields": [value: FeatFormFields] }>();

const pre = computed<FeatPrerequisites>(() => fields.prerequisites ?? {});

function setCategory(value: FeatCategory | "") {
  emit("update:fields", { ...fields, feat_category: value === "" ? null : value });
}

function setPre<K extends keyof FeatPrerequisites>(key: K, value: FeatPrerequisites[K] | undefined) {
  const next: FeatPrerequisites = { ...pre.value };
  if (value === undefined) delete next[key];
  else next[key] = value;
  emit("update:fields", { ...fields, prerequisites: Object.keys(next).length > 0 ? next : null });
}

function setAbilityScore(key: AbilityKey, score: number | undefined) {
  setPre("abilities", withAbilityScore(pre.value.abilities, key, score));
}

function setArmor(value: NonNullable<FeatPrerequisites["armor"]> | "") {
  setPre("armor", value === "" ? undefined : value);
}

function setIncrease(patch: Partial<FeatAbilityIncrease>) {
  if (fields.ability_increase) emit("update:fields", { ...fields, ability_increase: { ...fields.ability_increase, ...patch } });
}

function toggleAbility(key: AbilityKey, on: boolean) {
  if (!fields.ability_increase) return;
  const rest = fields.ability_increase.abilities.filter((a) => a !== key);
  setIncrease({ abilities: on ? [...rest, key] : rest });
}
</script>
