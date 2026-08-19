<template>
  <!-- Ability scores -->
  <p class="text-label-lg font-semibold text-muted-foreground uppercase">
    Ability Scores
  </p>
  <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
    <label
      v-for="stat in ABILITY_STATS"
      :key="stat.key"
      class="flex flex-col items-center gap-1"
    >
      <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
      <AppInput
        :model-value="form[stat.key]"
        type="number"
        min="1"
        max="30"
        tone="filled"
        size="body-xs"
        align="center"
        @update:model-value="(v) => patch({ [stat.key]: Number(v) })"
      />
      <span
        class="font-cinzel text-xs font-bold"
        :class="mod(form[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'"
      >
        {{ mod(form[stat.key]) >= 0 ? "+" : "" }}{{ mod(form[stat.key]) }}
      </span>
    </label>
  </div>

  <!-- Combat stats -->
  <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-2">
    Combat
  </p>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <label class="block">
      <span class="field-label">Max HP</span>
      <AppInput
        :model-value="form.max_hp"
        type="number"
        min="1"
        tone="filled"
        size="body"
        @update:model-value="(v) => patch({ max_hp: Number(v) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Current HP</span>
      <AppInput
        :model-value="form.current_hp"
        type="number"
        tone="filled"
        size="body"
        @update:model-value="(v) => patch({ current_hp: Number(v) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Temp HP</span>
      <AppInput
        :model-value="form.temp_hp"
        type="number"
        min="0"
        tone="filled"
        size="body"
        @update:model-value="(v) => patch({ temp_hp: Number(v) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Armor Class</span>
      <AppInput
        :model-value="form.ac"
        type="number"
        min="1"
        tone="filled"
        size="body"
        @update:model-value="(v) => patch({ ac: Number(v) })"
      />
      <span class="text-caption text-muted-foreground italic">Without shield — an equipped shield adds its bonus automatically.</span>
    </label>
    <label class="block">
      <span class="field-label">Speed (ft)</span>
      <AppInput
        :model-value="form.speed"
        type="number"
        min="0"
        step="5"
        tone="filled"
        size="body"
        @update:model-value="(v) => patch({ speed: Number(v) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Initiative Bonus</span>
      <AppInput
        :model-value="form.initiative_bonus"
        type="number"
        tone="filled"
        size="body"
        placeholder="extra on top of DEX (e.g. Alert +5)"
        @update:model-value="(v) => patch({ initiative_bonus: Number(v) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Carry Capacity Override</span>
      <AppInput
        :model-value="form.carry_capacity_override"
        type="text"
        tone="filled"
        size="body"
        placeholder="*2, +30, 150 — blank = STR×15"
        @update:model-value="(v) => patch({ carry_capacity_override: v || null })"
      />
    </label>
  </div>

  <!-- Computed passives (read-only) -->
  <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
    <div>
      <p class="text-eyebrow text-muted-foreground">PASSIVE PERC.</p>
      <p class="text-heading-sm font-bold text-foreground">{{ passivePerception }}</p>
    </div>
    <div>
      <p class="text-eyebrow text-muted-foreground">PASSIVE INS.</p>
      <p class="text-heading-sm font-bold text-foreground">{{ passiveInsight }}</p>
    </div>
    <div>
      <p class="text-eyebrow text-muted-foreground">PASSIVE INV.</p>
      <p class="text-heading-sm font-bold text-foreground">{{ passiveInvestigation }}</p>
    </div>
  </div>

  <!-- Spell slots -->
  <div class="flex items-center justify-between mt-2">
    <p class="text-label-lg font-semibold text-muted-foreground uppercase">
      Spell Slots (Max per Level)
    </p>
    <AppButton
      variant="ghost"
      tone="primary"
      size="inline-xs"
      label="Reset to class defaults"
      class="text-primary/70"
      @click="emit('resetSlots')"
    />
  </div>
  <div class="grid grid-cols-3 gap-2">
    <label
      v-for="lvl in 9"
      :key="lvl"
      class="flex flex-col items-center gap-1"
    >
      <span class="text-label font-semibold text-muted-foreground">
        {{ SLOT_LEVEL_LABELS[lvl - 1] }}
      </span>
      <AppInput
        :model-value="spellSlotMaxes[lvl - 1]"
        type="number"
        min="0"
        max="9"
        tone="filled"
        size="body-xs"
        align="center"
        @update:model-value="(v) => emit('update:spellSlotMax', lvl - 1, Number(v))"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import AppButton from "@/components/common/AppButton.vue";
import AppInput from "@/components/common/AppInput.vue";
import type { AbilitiesFormSlice } from "./partyMemberForm.types";
import type { SkillProficiencies } from "@/types/party.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

const { form, spellSlotMaxes, skillProficiencies, profBonus } = defineProps<{
  form: AbilitiesFormSlice;
  spellSlotMaxes: number[];
  skillProficiencies: SkillProficiencies;
  profBonus: number;
}>();

const emit = defineEmits<{
  "update:form": [patch: Partial<AbilitiesFormSlice>];
  "update:spellSlotMax": [index: number, value: number];
  resetSlots: [];
}>();

function patch(p: Partial<AbilitiesFormSlice>) {
  emit("update:form", p);
}

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

function skillProf(key: keyof SkillProficiencies) {
  return skillProficiencies[key] ?? "none";
}

const passivePerception = computed(() => {
  const base = mod(form.wis);
  const prof = skillProf("perception");
  return 10 + base + (prof === "proficient" ? profBonus : prof === "expertise" ? profBonus * 2 : 0);
});

const passiveInsight = computed(() => {
  const base = mod(form.wis);
  const prof = skillProf("insight");
  return 10 + base + (prof === "proficient" ? profBonus : prof === "expertise" ? profBonus * 2 : 0);
});

const passiveInvestigation = computed(() => {
  const base = mod(form.int);
  const prof = skillProf("investigation");
  return 10 + base + (prof === "proficient" ? profBonus : prof === "expertise" ? profBonus * 2 : 0);
});
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
</style>
