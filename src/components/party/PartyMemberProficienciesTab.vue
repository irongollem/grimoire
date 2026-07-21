<template>
  <!-- Saving throws -->
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">
    Saving Throw Proficiencies
  </p>
  <div class="grid grid-cols-3 gap-2">
    <label
      v-for="save in SAVE_STATS"
      :key="save.key"
      class="flex items-center gap-2 cursor-pointer"
    >
      <input
        type="checkbox"
        :checked="form.saving_throw_proficiencies.includes(save.key)"
        class="rounded"
        @change="toggleSave(save.key)"
      />
      <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
      <span class="font-cinzel text-2xs text-muted-foreground">{{ saveBonus(save.key) }}</span>
    </label>
  </div>

  <!-- Skills -->
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">
    Skills
  </p>
  <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
    <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
      <div class="flex rounded overflow-hidden border border-border text-2xs font-cinzel font-semibold shrink-0">
        <button
          v-for="level in PROF_LEVELS"
          :key="level.value"
          type="button"
          class="px-1.5 py-0.5 transition-colors"
          :class="
            (form.skill_proficiencies[skill.key] ?? 'none') === level.value
              ? 'bg-primary text-primary-foreground'
              : 'bg-card text-muted-foreground hover:text-foreground'
          "
          @click="setSkillProf(skill.key, level.value)"
        >
          {{ level.label }}
        </button>
      </div>
      <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
      <span class="font-cinzel text-2xs text-muted-foreground shrink-0">
        {{ skillBonus(skill.key, skill.ability) }}
      </span>
    </div>
  </div>

  <!-- Tool Proficiencies -->
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-4">
    Tool Proficiencies
  </p>
  <TagPickerInput
    :model-value="form.tool_proficiencies"
    :groups="TOOL_PROFICIENCY_GROUPS"
    placeholder="Search tools…"
    variant="primary"
    @update:model-value="patch({ tool_proficiencies: $event })"
  />

  <!-- Languages -->
  <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">
    Languages
  </p>
  <TagPickerInput
    :model-value="form.languages"
    :groups="LANGUAGE_GROUPS"
    placeholder="Search languages…"
    @update:model-value="patch({ languages: $event })"
  />
</template>

<script setup lang="ts">
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import type { ProficienciesFormSlice } from "./partyMemberForm.types";
import type { SkillProfLevel, SaveKey } from "@/types/party.types";

const SAVE_STATS = [
  { key: "str" as SaveKey, label: "Strength" },
  { key: "dex" as SaveKey, label: "Dexterity" },
  { key: "con" as SaveKey, label: "Constitution" },
  { key: "int" as SaveKey, label: "Intelligence" },
  { key: "wis" as SaveKey, label: "Wisdom" },
  { key: "cha" as SaveKey, label: "Charisma" },
];

const PROF_LEVELS: { value: SkillProfLevel; label: string }[] = [
  { value: "none", label: "–" },
  { value: "proficient", label: "P" },
  { value: "expertise", label: "E" },
];

const { form, profBonus } = defineProps<{
  form: ProficienciesFormSlice;
  profBonus: number;
}>();

const emit = defineEmits<{
  "update:form": [patch: Partial<ProficienciesFormSlice>];
}>();

function patch(p: Partial<ProficienciesFormSlice>) {
  emit("update:form", p);
}

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

function skillProf(key: keyof ProficienciesFormSlice["skill_proficiencies"]) {
  return form.skill_proficiencies[key] ?? "none";
}

function setSkillProf(key: keyof ProficienciesFormSlice["skill_proficiencies"], val: SkillProfLevel) {
  patch({ skill_proficiencies: { ...form.skill_proficiencies, [key]: val } });
}

function skillBonus(key: keyof ProficienciesFormSlice["skill_proficiencies"], ability: SaveKey): string {
  const base = mod(form[ability]);
  const prof = skillProf(key);
  const bonus =
    prof === "proficient" ? base + profBonus
    : prof === "expertise" ? base + profBonus * 2
    : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}

function toggleSave(key: SaveKey) {
  const current = [...form.saving_throw_proficiencies];
  const idx = current.indexOf(key);
  if (idx >= 0) current.splice(idx, 1);
  else current.push(key);
  patch({ saving_throw_proficiencies: current });
}

function saveBonus(key: SaveKey): string {
  const base = mod(form[key]);
  const bonus = form.saving_throw_proficiencies.includes(key) ? base + profBonus : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}
</script>
