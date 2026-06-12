<template>
  <!-- Ability scores -->
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">
    Ability Scores
  </p>
  <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
    <label
      v-for="stat in ABILITY_STATS"
      :key="stat.key"
      class="flex flex-col items-center gap-1"
    >
      <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
      <input
        :value="form[stat.key]"
        type="number"
        min="1"
        max="30"
        class="field-input w-full text-center px-1"
        @change="patch({ [stat.key]: Number(($event.target as HTMLInputElement).value) })"
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
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">
    Combat
  </p>
  <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
    <label class="block">
      <span class="field-label">Max HP</span>
      <input
        :value="form.max_hp"
        type="number"
        min="1"
        class="field-input w-full"
        @change="patch({ max_hp: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Current HP</span>
      <input
        :value="form.current_hp"
        type="number"
        class="field-input w-full"
        @change="patch({ current_hp: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Temp HP</span>
      <input
        :value="form.temp_hp"
        type="number"
        min="0"
        class="field-input w-full"
        @change="patch({ temp_hp: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Armor Class</span>
      <input
        :value="form.ac"
        type="number"
        min="1"
        class="field-input w-full"
        @change="patch({ ac: Number(($event.target as HTMLInputElement).value) })"
      />
      <span class="font-fell text-xs text-muted-foreground italic">Without shield — an equipped shield adds its bonus automatically.</span>
    </label>
    <label class="block">
      <span class="field-label">Speed (ft)</span>
      <input
        :value="form.speed"
        type="number"
        min="0"
        step="5"
        class="field-input w-full"
        @change="patch({ speed: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Initiative Bonus</span>
      <input
        :value="form.initiative_bonus"
        type="number"
        class="field-input w-full"
        placeholder="= DEX mod"
        @change="patch({ initiative_bonus: Number(($event.target as HTMLInputElement).value) })"
      />
    </label>
    <label class="block">
      <span class="field-label">Carry Capacity Override</span>
      <input
        :value="form.carry_capacity_override ?? ''"
        type="text"
        class="field-input w-full"
        placeholder="*2, +30, 150 — blank = STR×15"
        @input="patch({ carry_capacity_override: ($event.target as HTMLInputElement).value || null })"
      />
    </label>
  </div>

  <!-- Computed passives (read-only) -->
  <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
    <div>
      <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE PERC.</p>
      <p class="font-cinzel text-base font-bold text-foreground">{{ passivePerception }}</p>
    </div>
    <div>
      <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INS.</p>
      <p class="font-cinzel text-base font-bold text-foreground">{{ passiveInsight }}</p>
    </div>
    <div>
      <p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INV.</p>
      <p class="font-cinzel text-base font-bold text-foreground">{{ passiveInvestigation }}</p>
    </div>
  </div>

  <!-- Spell slots -->
  <div class="flex items-center justify-between mt-2">
    <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">
      Spell Slots (Max per Level)
    </p>
    <button
      type="button"
      class="font-cinzel text-[10px] tracking-wider text-primary/70 hover:text-primary transition-colors"
      @click="emit('resetSlots')"
    >
      Reset to class defaults
    </button>
  </div>
  <div class="grid grid-cols-3 gap-2">
    <label
      v-for="lvl in 9"
      :key="lvl"
      class="flex flex-col items-center gap-1"
    >
      <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">
        {{ SLOT_LEVEL_LABELS[lvl - 1] }}
      </span>
      <input
        :value="spellSlotMaxes[lvl - 1]"
        type="number"
        min="0"
        max="9"
        class="field-input w-full text-center px-1"
        @change="emit('update:spellSlotMax', lvl - 1, Number(($event.target as HTMLInputElement).value))"
      />
    </label>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
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
  @apply block font-cinzel text-xs font-semibold tracking-wider text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 font-fell text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
