<template>
  <div class="max-w-2xl mx-auto space-y-6 pb-8">
    <div>
      <h1 class="font-cinzel text-xl font-bold text-foreground">
        Edit {{ existingMember?.name ?? "Character" }}
      </h1>
      <p class="font-fell text-sm text-muted-foreground italic mt-1">Update your hero's details below.</p>
    </div>

    <div class="flex border-b border-border">
      <button v-for="tab in EDIT_TABS" :key="tab.id" type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="activeTab === tab.id ? 'border-b-2 border-primary text-primary' : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id">
        {{ tab.label }}
      </button>
    </div>

    <!-- Identity -->
    <div v-if="activeTab === 'identity'" class="space-y-4">
      <div class="flex gap-4">
        <div class="w-28 shrink-0">
          <ImageUpload bucket="npc-portraits" :model-value="portraitUrl || null" :focal-point="focalPoint" show-focal-point
            @update:model-value="portraitUrl = $event ?? ''" @update:focal-point="focalPoint = $event" />
        </div>
        <div class="flex-1 flex flex-col gap-2">
          <label class="block">
            <span class="field-label">Character Name *</span>
            <input v-model="f.name" class="field-input w-full" placeholder="Aric Stormblade" />
          </label>
          <label class="block">
            <span class="field-label">Player Name</span>
            <input v-model="f.player_name" class="field-input w-full" :placeholder="auth.membership?.display_name ?? 'Your name'" />
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="field-label">Species</span>
          <p v-if="!!f.species_id" class="font-fell text-sm text-foreground inline">
            {{ currentSpeciesName }}&ensp;<RouterLink to="/play/species" class="font-cinzel text-[11px] text-primary hover:underline">Change</RouterLink>
          </p>
          <RouterLink v-else to="/play/species" class="font-cinzel text-xs font-semibold text-primary hover:underline">
            Browse &amp; Pick a Species
          </RouterLink>
        </div>
        <div>
          <span class="field-label">Class</span>
          <p class="font-fell text-sm text-foreground">
            {{ f.class ?? '—' }}<span v-if="f.subclass" class="text-muted-foreground"> · {{ f.subclass }}</span>
          </p>
        </div>
        <div>
          <span class="field-label">Level</span>
          <p class="font-fell text-sm text-foreground">{{ f.level }}</p>
        </div>
        <div>
          <span class="field-label">Background</span>
          <p v-if="currentBgName" class="font-fell text-sm text-foreground inline">
            {{ currentBgName }}&ensp;<RouterLink to="/play/background" class="font-cinzel text-[11px] text-primary hover:underline">Change</RouterLink>
          </p>
          <RouterLink v-else to="/play/background" class="font-cinzel text-xs font-semibold text-primary hover:underline">
            Browse &amp; Pick a Background
          </RouterLink>
        </div>
      </div>

      <div>
        <span class="field-label">Notes</span>
        <RichTextEditor v-model="f.notes" placeholder="Background, personality, goals…" min-height="120px" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="activeTab === 'stats'" class="space-y-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Ability Scores</p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
          <input v-model.number="f[stat.key]" type="number" min="1" max="30" class="field-input w-full text-center px-1" />
          <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
          </span>
        </label>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Combat</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block"><span class="field-label">Max HP</span><input v-model.number="f.max_hp" type="number" min="1" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Current HP</span><input v-model.number="f.current_hp" type="number" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Temp HP</span><input v-model.number="f.temp_hp" type="number" min="0" class="field-input w-full" /></label>
        <!-- Armor Class — formula picker -->
        <div class="block col-span-2 sm:col-span-3">
          <span class="field-label">Armor Class</span>
          <div class="flex flex-wrap gap-2 items-center">
            <select v-model="acFormulaType" class="field-input shrink-0">
              <option value="">Manual</option>
              <option value="unarmored:dex+con">Unarmored Defense (Barbarian)</option>
              <option value="unarmored:dex+wis">Unarmored Defense (Monk)</option>
              <option value="mage_armor">Mage Armor</option>
              <option value="natural">Natural Armor</option>
            </select>
            <!-- Manual: editable number -->
            <input v-if="!acFormulaType" v-model.number="f.ac" type="number" min="1" class="field-input w-20" />
            <!-- Formula: computed read-only value + optional natural base input -->
            <template v-else>
              <span class="field-input w-16 text-center font-bold pointer-events-none select-none">{{ f.ac }}</span>
              <span class="font-fell text-xs text-muted-foreground italic">{{ acFormulaLabel }}</span>
              <input v-if="acFormulaType === 'natural'" v-model.number="naturalBase" type="number" min="1" class="field-input w-20" placeholder="Base AC" />
            </template>
          </div>
          <p class="font-fell text-xs text-muted-foreground italic mt-1">Without shield — an equipped shield adds its bonus automatically.</p>
        </div>
        <label class="block"><span class="field-label">Speed (ft)</span><input v-model.number="f.speed" type="number" min="0" step="5" class="field-input w-full" /></label>
        <label class="block"><span class="field-label">Initiative Bonus</span><input v-model.number="f.initiative_bonus" type="number" class="field-input w-full" placeholder="extra on top of DEX (e.g. Alert +5)" /></label>
        <label class="block"><span class="field-label">Carry Capacity Override</span><input v-model="f.carry_capacity_override" type="text" class="field-input w-full" placeholder="*2, +30, 150" /></label>
      </div>

      <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE PERC.</p><p class="font-cinzel text-base font-bold">{{ passivePerception }}</p></div>
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INS.</p><p class="font-cinzel text-base font-bold">{{ passiveInsight }}</p></div>
        <div><p class="font-cinzel text-[10px] text-muted-foreground tracking-wider">PASSIVE INV.</p><p class="font-cinzel text-base font-bold">{{ passiveInvestigation }}</p></div>
      </div>

      <div class="flex items-center justify-between mt-2">
        <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Spell Slots (Max per Level)</p>
        <button type="button" class="font-cinzel text-[10px] tracking-wider text-primary/70 hover:text-primary transition-colors" @click="resetSlotsToDefault">Reset to class defaults</button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="lvl in 9" :key="lvl" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
          <input v-model.number="spellSlotMaxes[lvl - 1]" type="number" min="0" max="9" class="field-input w-full text-center px-1" />
        </label>
      </div>
    </div>

    <!-- Proficiencies -->
    <div v-if="activeTab === 'profs'" class="space-y-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">Saving Throw Proficiencies</p>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
          <input type="checkbox" :checked="f.saving_throw_proficiencies.includes(save.key)" class="rounded" @change="toggleSave(save.key)" />
          <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground">{{ saveBonus(save.key) }}</span>
        </label>
      </div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">Skills</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
          <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
            <button v-for="level in PROF_LEVELS" :key="level.value" type="button"
              class="px-1.5 py-0.5 transition-colors"
              :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value ? 'bg-primary text-primary-foreground' : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="setSkillProf(skill.key, level.value)">{{ level.label }}</button>
          </div>
          <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">{{ skillBonus(skill.key, skill.ability) }}</span>
        </div>
      </div>
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-4">Tool Proficiencies</p>
      <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" @update:model-value="f.tool_proficiencies = $event" />
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">Languages</p>
      <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" @update:model-value="f.languages = $event" />
    </div>

    <div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <button type="button" class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors" @click="router.push(backRoute)">Cancel</button>
      <button type="button" :disabled="!f.name.trim() || saving"
        class="min-w-28 px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50" @click="save()">
        {{ saving ? "Saving…" : "Save Changes" }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from "vue";
import { CHARACTER_FORM_KEY, EDIT_TABS, ABILITY_STATS, SAVE_STATS, PROF_LEVELS, SLOT_LEVEL_LABELS } from "@/composables/useCharacterCreationForm";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import ImageUpload from "@/components/common/ImageUpload.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const {
  router, auth, f,
  activeTab, saving,
  portraitUrl, focalPoint, spellSlotMaxes,
  existingMember, backRoute,
  speciesOptions, backgroundOptions, selectedSpecies,
  passivePerception, passiveInsight, passiveInvestigation,
  mod, setSkillProf, skillBonus, toggleSave, saveBonus,
  resetSlotsToDefault,
  save,
} = form;

const currentSpeciesName = computed(
  () => (speciesOptions.value as Array<{ id: string; name: string }>).find((s) => s.id === f.species_id)?.name ?? "—",
);
const currentBgName = computed(
  () => (backgroundOptions.value as Array<{ id: string; name: string }>).find((b) => b.id === f.background_id)?.name ?? null,
);

// ── AC formula picker ─────────────────────────────────────────────────────────

/** Dropdown value: "" = manual, "natural" = natural armor, else the formula string. */
const acFormulaType = computed({
  get(): string {
    const fm = f.ac_formula;
    if (!fm) return "";
    if (fm.startsWith("natural:")) return "natural";
    return fm;
  },
  set(val: string) {
    if (val === "") {
      f.ac_formula = null;
    } else if (val === "natural") {
      // Seed from species natural_armor_ac if available, else 10.
      const speciesBase = (selectedSpecies.value as { natural_armor_ac?: number | null } | null)?.natural_armor_ac ?? 10;
      f.ac_formula = `natural:${speciesBase}`;
    } else {
      f.ac_formula = val;
    }
  },
});

/** The base AC integer for the natural armor option. */
const naturalBase = computed({
  get(): number {
    const fm = f.ac_formula;
    if (fm?.startsWith("natural:")) return parseInt(fm.slice(8), 10) || 10;
    return (selectedSpecies.value as { natural_armor_ac?: number | null } | null)?.natural_armor_ac ?? 10;
  },
  set(val: number) {
    f.ac_formula = `natural:${val}`;
  },
});

const acFormulaLabel = computed(() => {
  const fm = f.ac_formula;
  if (!fm) return "";
  if (fm === "unarmored:dex+con") return `10 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)}) + CON (${mod(f.con) >= 0 ? "+" : ""}${mod(f.con)})`;
  if (fm === "unarmored:dex+wis") return `10 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)}) + WIS (${mod(f.wis) >= 0 ? "+" : ""}${mod(f.wis)})`;
  if (fm === "mage_armor")        return `13 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)})`;
  if (fm.startsWith("natural:"))  return "Natural Armor — base:";
  return "";
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
