<template>
  <div class="rounded-lg border border-border bg-card/50 p-4 flex flex-col gap-3">
    <h3
      class="text-label-lg font-bold text-muted-foreground uppercase"
    >
      Mechanics
    </h3>

    <!-- Attack / targeting type -->
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >Attack / Targeting</span
        >
        <AppSelect
          v-model="attackTypeModel"
          tone="filled"
          size="body"
          weight="normal"
        >
          <option value="">— none selected —</option>
          <option v-for="o in ATTACK_TYPES" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </AppSelect>
      </label>

      <!-- Save attribute + effect (only for saving throw) -->
      <template v-if="attackType === 'save'">
        <label class="flex flex-col gap-1">
          <span class="text-eyebrow text-muted-foreground"
            >Save Attribute</span
          >
          <AppSelect
            v-model="saveAttributeModel"
            tone="filled"
            size="body"
            weight="normal"
          >
            <option value="">—</option>
            <option v-for="a in SAVE_ATTRIBUTES" :key="a" :value="a">{{ a }}</option>
          </AppSelect>
        </label>
        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-eyebrow text-muted-foreground"
            >Effect on Successful Save</span
          >
          <AppSelect
            v-model="saveEffectModel"
            tone="filled"
            size="body"
            weight="normal"
          >
            <option value="">—</option>
            <option v-for="o in SAVE_EFFECTS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </AppSelect>
        </label>
      </template>
    </div>

    <!-- Damage rolls -->
    <div class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Damage</span
      >
      <DamageRollsInput :model-value="damageRolls" :school="school" @update:model-value="$emit('update:damageRolls', $event)" />
    </div>

    <!-- Healing -->
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Healing Dice
        <span class="normal-case font-fell font-normal">(if applicable)</span></span
      >
      <AppInput
        v-model="healingDiceModel"
        placeholder="e.g. 1d8, 2d6+mod"
        tone="filled"
        size="body"
      />
    </label>

    <!-- Target description -->
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Target Description
        <span class="normal-case font-fell font-normal">(what does it hit?)</span></span
      >
      <AppInput
        v-model="targetDescriptionModel"
        placeholder="e.g. one creature you can see within range, up to three willing creatures…"
        tone="filled"
        size="body"
      />
    </label>

    <!-- AoE -->
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >AoE Shape
          <span class="normal-case font-fell font-normal">(if applicable)</span></span
        >
        <AppSelect
          v-model="aoeShapeModel"
          tone="filled"
          size="body"
          weight="normal"
          class="capitalize"
        >
          <option value="">—</option>
          <option v-for="s in AOE_SHAPES" :key="s" :value="s" class="capitalize">
            {{ s }}
          </option>
        </AppSelect>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >AoE Size</span
        >
        <AppInput
          v-model="aoeSizeModel"
          placeholder="e.g. 20-foot radius"
          tone="filled"
          size="body"
        />
      </label>
    </div>

    <!-- Condition inflicted -->
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Condition Inflicted
        <span class="normal-case font-fell font-normal">(optional)</span></span
      >
      <AppInput
        v-model="conditionInflictedModel"
        placeholder="e.g. blinded, stunned, frightened…"
        tone="filled"
        size="body"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { ATTACK_TYPES, SAVE_ATTRIBUTES, SAVE_EFFECTS, AOE_SHAPES } from "@/types/spell.types";
import type { SpellSchool } from "@/types/spell.types";
import DamageRollsInput from "@/components/common/DamageRollsInput.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import type { DamageRoll } from "@/lib/dice/dice";

const {
  attackType,
  saveAttribute,
  saveEffect,
  damageRolls,
  healingDice,
  targetDescription,
  aoeShape,
  aoeSize,
  conditionInflicted,
  school,
} = defineProps<{
  attackType: string;
  saveAttribute: string;
  saveEffect: string;
  damageRolls: DamageRoll[];
  healingDice: string;
  targetDescription: string;
  aoeShape: string;
  aoeSize: string;
  conditionInflicted: string;
  school: SpellSchool;
}>();

const emit = defineEmits<{
  "update:attackType": [value: string];
  "update:saveAttribute": [value: string];
  "update:saveEffect": [value: string];
  "update:damageRolls": [value: DamageRoll[]];
  "update:healingDice": [value: string];
  "update:targetDescription": [value: string];
  "update:aoeShape": [value: string];
  "update:aoeSize": [value: string];
  "update:conditionInflicted": [value: string];
}>();

// AppInput/AppSelect require a real v-model; this component is a pure
// prop-in/emit-out controlled component (no local state of its own), so each
// field gets a thin writable computed bridging the prop to its emit.
const attackTypeModel = computed({ get: () => attackType, set: (v: string) => emit("update:attackType", v) });
const saveAttributeModel = computed({ get: () => saveAttribute, set: (v: string) => emit("update:saveAttribute", v) });
const saveEffectModel = computed({ get: () => saveEffect, set: (v: string) => emit("update:saveEffect", v) });
const healingDiceModel = computed({ get: () => healingDice, set: (v: string) => emit("update:healingDice", v) });
const targetDescriptionModel = computed({ get: () => targetDescription, set: (v: string) => emit("update:targetDescription", v) });
const aoeShapeModel = computed({ get: () => aoeShape, set: (v: string) => emit("update:aoeShape", v) });
const aoeSizeModel = computed({ get: () => aoeSize, set: (v: string) => emit("update:aoeSize", v) });
const conditionInflictedModel = computed({ get: () => conditionInflicted, set: (v: string) => emit("update:conditionInflicted", v) });
</script>
