<template>
  <div class="flex flex-col gap-3">
    <MechField label="It is">
      <AppSelect :model-value="effect.kind" tone="card" size="body" weight="normal" block @update:model-value="emit('update:effect', effectOfKind($event, effect))">
        <option v-for="k in EFFECT_KIND_OPTIONS" :key="k.value" :value="k.value">{{ k.label }}</option>
      </AppSelect>
    </MechField>

    <div v-if="effect.attack" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <MechField label="Delivered">
        <AppSelect :model-value="effect.attack.delivery" tone="card" size="body" weight="normal" block @update:model-value="setAttack({ delivery: $event })">
          <option value="melee">Melee</option>
          <option value="ranged">Ranged</option>
        </AppSelect>
      </MechField>
      <MechField label="Attack bonus from" hint="Proficiency plus this modifier.">
        <AppSelect :model-value="effect.attack.ability" tone="card" size="body" weight="normal" block @update:model-value="setAttack({ ability: $event })">
          <option v-for="o in SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </MechField>
      <MechField label="Range">
        <AppInput :model-value="effect.attack.range ?? ''" tone="card" size="body" placeholder="120 ft" @update:model-value="setRange(String($event))" />
      </MechField>
    </div>

    <AppCheckbox
      v-if="effect.kind === 'attack'"
      :model-value="effect.save !== undefined"
      label="A hit forces a saving throw"
      label-role="caption"
      @update:model-value="emit('update:effect', withForcedSave(effect, $event))"
    />
    <div v-if="effect.save" class="grid grid-cols-1 sm:grid-cols-3 gap-3">
      <MechField label="Saving throw">
        <AppSelect :model-value="effect.save.ability" tone="card" size="body" weight="normal" block @update:model-value="setSave({ ability: $event })">
          <option v-for="a in ABILITY_KEYS" :key="a" :value="a">{{ ABILITY_LABELS[a] }}</option>
        </AppSelect>
      </MechField>
      <MechField label="DC from" hint="8 + proficiency + this modifier, or the class's spell save DC.">
        <AppSelect :model-value="effect.save.dc_ability" tone="card" size="body" weight="normal" block @update:model-value="setSave({ dc_ability: $event })">
          <option v-for="o in SOURCE_OPTIONS" :key="o.value" :value="o.value">{{ o.label }}</option>
        </AppSelect>
      </MechField>
      <MechField label="On a success">
        <AppSelect :model-value="effect.save.success" tone="card" size="body" weight="normal" block @update:model-value="setSave({ success: $event })">
          <option value="half">Half damage</option>
          <option value="none">No damage</option>
        </AppSelect>
      </MechField>
    </div>

    <AppCheckbox
      v-if="optionalDamage"
      :model-value="effect.dice !== undefined"
      label="Deals damage"
      label-role="caption"
      @update:model-value="emit('update:effect', withDamage(effect, $event))"
    />
    <AppCheckbox
      v-if="alwaysAmount"
      :model-value="!rollsDice(effect)"
      label="No dice (a fixed amount)"
      label-role="caption"
      @update:model-value="emit('update:effect', withDice(effect, !$event))"
    />
    <template v-if="effect.dice || effect.add">
      <MechField v-if="effect.dice" :label="LEVEL_LABEL[effect.kind]" hint="Levels are levels in the class that grants the feature. A plain number works too.">
        <ByLevelTable :model-value="effect.dice" value-label="Roll, like 2d6" @update:model-value="emit('update:effect', { ...effect, dice: $event })" />
      </MechField>
      <MechField v-if="effect.kind !== 'heal' && effect.kind !== 'temp_hp'" label="Damage type">
        <AppSelect :model-value="effect.damage_type ?? ''" tone="card" size="body" weight="normal" block @update:model-value="setDamageType($event)">
          <option value="">No type</option>
          <option v-for="t in DAMAGE_TYPES" :key="t" :value="t">{{ t }}</option>
        </AppSelect>
      </MechField>
      <fieldset class="flex flex-col gap-2">
        <legend class="block text-eyebrow text-muted-foreground mb-1.5">Added to the total</legend>
        <div class="flex flex-wrap gap-x-4 gap-y-2">
          <AppCheckbox
            v-for="a in ABILITY_KEYS"
            :key="a"
            :model-value="hasAdd(effect, { kind: 'ability', ability: a })"
            :label="`${ABILITY_LABELS[a]} modifier`"
            label-role="caption"
            @update:model-value="emit('update:effect', toggleAdd(effect, { kind: 'ability', ability: a }, $event))"
          />
          <AppCheckbox
            :model-value="hasAdd(effect, { kind: 'proficiency' })"
            label="Proficiency bonus"
            label-role="caption"
            @update:model-value="emit('update:effect', toggleAdd(effect, { kind: 'proficiency' }, $event))"
          />
          <AppCheckbox
            :model-value="hasAdd(effect, { kind: 'class_level' })"
            label="Class level"
            label-role="caption"
            @update:model-value="emit('update:effect', toggleAdd(effect, { kind: 'class_level' }, $event))"
          />
        </div>
      </fieldset>
      <MechField label="Never less than" hint="A floor on what is added, like 1 for a Charisma modifier (minimum of 1). The dice are not floored. Leave empty for none.">
        <AppInput :model-value="effect.min ?? ''" type="number" tone="card" size="body" min="0" @update:model-value="emit('update:effect', withMin(effect, String($event)))" />
      </MechField>
    </template>

    <MechField label="Area" hint="Shown beside the roll, like 15-ft cone.">
      <AppInput :model-value="effect.area ?? ''" tone="card" size="body" placeholder="15-ft cone" @update:model-value="setArea(String($event))" />
    </MechField>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import AppSelect from "@/components/common/controls/AppSelect.vue";
import type { FeatureEffect } from "@/rules/features/mechanics.types";
import { ABILITY_KEYS, ABILITY_LABELS } from "@/types/card.types";
import { DAMAGE_TYPES } from "@/types/damage.types";
import ByLevelTable from "./ByLevelTable.vue";
import { EFFECT_KIND_OPTIONS, effectOfKind, hasAdd, rollsDice, toggleAdd, withDamage, withDice, withForcedSave, withMin } from "./mechanicsDraft";
import MechField from "./MechField.vue";

/**
 * A rollable effect as fields (#976): an attack, a saving throw it forces,
 * damage or healing. Shared by the feature itself and each of its sub-actions,
 * which differ only in where the effect is stored. The numbers (DC, to-hit,
 * dice at the character's level) are worked out on the sheet, never typed here.
 */
const { effect } = defineProps<{ effect: FeatureEffect }>();
const emit = defineEmits<{ "update:effect": [value: FeatureEffect] }>();

const LEVEL_LABEL: Record<FeatureEffect["kind"], string> = {
  attack: "Damage by level",
  save: "Damage by level",
  damage: "Damage by level",
  heal: "Healing by level",
  temp_hp: "Temporary hit points by level",
};

const SOURCE_OPTIONS = [
  ...ABILITY_KEYS.map((a) => ({ value: a, label: ABILITY_LABELS[a] })),
  { value: "spell", label: "Spellcasting" },
] as const;

/** Heal, temporary hit points and damage can be a fixed amount instead of dice. */
const alwaysAmount = computed(() => !optionalDamage.value);

/** Heal and damage always have dice; an attack or save may only impose something. */
const optionalDamage = computed(() => effect.kind === "attack" || effect.kind === "save");

function setAttack(patch: Partial<NonNullable<FeatureEffect["attack"]>>) {
  if (!effect.attack) return;
  emit("update:effect", { ...effect, attack: { ...effect.attack, ...patch } });
}

function setRange(value: string) {
  if (!effect.attack) return;
  const { range: _range, ...rest } = effect.attack;
  emit("update:effect", { ...effect, attack: value === "" ? rest : { ...rest, range: value } });
}

function setSave(patch: Partial<NonNullable<FeatureEffect["save"]>>) {
  if (!effect.save) return;
  emit("update:effect", { ...effect, save: { ...effect.save, ...patch } });
}

function setDamageType(value: string) {
  const { damage_type: _type, ...rest } = effect;
  emit("update:effect", value === "" ? rest : { ...rest, damage_type: value });
}

function setArea(value: string) {
  const { area: _area, ...rest } = effect;
  emit("update:effect", value === "" ? rest : { ...rest, area: value });
}
</script>
