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
        <select
          :value="attackType"
          class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @change="$emit('update:attackType', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">— none selected —</option>
          <option v-for="o in ATTACK_TYPES" :key="o.value" :value="o.value">
            {{ o.label }}
          </option>
        </select>
      </label>

      <!-- Save attribute + effect (only for saving throw) -->
      <template v-if="attackType === 'save'">
        <label class="flex flex-col gap-1">
          <span class="text-eyebrow text-muted-foreground"
            >Save Attribute</span
          >
          <select
            :value="saveAttribute"
            class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="$emit('update:saveAttribute', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="a in SAVE_ATTRIBUTES" :key="a" :value="a">{{ a }}</option>
          </select>
        </label>
        <label class="flex flex-col gap-1 col-span-2">
          <span class="text-eyebrow text-muted-foreground"
            >Effect on Successful Save</span
          >
          <select
            :value="saveEffect"
            class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
            @change="$emit('update:saveEffect', ($event.target as HTMLSelectElement).value)"
          >
            <option value="">—</option>
            <option v-for="o in SAVE_EFFECTS" :key="o.value" :value="o.value">
              {{ o.label }}
            </option>
          </select>
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
      <input
        :value="healingDice"
        placeholder="e.g. 1d8, 2d6+mod"
        class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:healingDice', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <!-- Target description -->
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Target Description
        <span class="normal-case font-fell font-normal">(what does it hit?)</span></span
      >
      <input
        :value="targetDescription"
        placeholder="e.g. one creature you can see within range, up to three willing creatures…"
        class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:targetDescription', ($event.target as HTMLInputElement).value)"
      />
    </label>

    <!-- AoE -->
    <div class="grid grid-cols-2 gap-3">
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >AoE Shape
          <span class="normal-case font-fell font-normal">(if applicable)</span></span
        >
        <select
          :value="aoeShape"
          class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground focus:outline-none focus:ring-1 focus:ring-ring capitalize"
          @change="$emit('update:aoeShape', ($event.target as HTMLSelectElement).value)"
        >
          <option value="">—</option>
          <option v-for="s in AOE_SHAPES" :key="s" :value="s" class="capitalize">
            {{ s }}
          </option>
        </select>
      </label>
      <label class="flex flex-col gap-1">
        <span class="text-eyebrow text-muted-foreground"
          >AoE Size</span
        >
        <input
          :value="aoeSize"
          placeholder="e.g. 20-foot radius"
          class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          @input="$emit('update:aoeSize', ($event.target as HTMLInputElement).value)"
        />
      </label>
    </div>

    <!-- Condition inflicted -->
    <label class="flex flex-col gap-1">
      <span class="text-eyebrow text-muted-foreground"
        >Condition Inflicted
        <span class="normal-case font-fell font-normal">(optional)</span></span
      >
      <input
        :value="conditionInflicted"
        placeholder="e.g. blinded, stunned, frightened…"
        class="bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        @input="$emit('update:conditionInflicted', ($event.target as HTMLInputElement).value)"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { ATTACK_TYPES, SAVE_ATTRIBUTES, SAVE_EFFECTS, AOE_SHAPES } from "@/types/spell.types";
import type { SpellSchool } from "@/types/spell.types";
import DamageRollsInput from "@/components/common/DamageRollsInput.vue";
import type { DamageRoll } from "@/lib/dice";

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

defineEmits<{
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
</script>
