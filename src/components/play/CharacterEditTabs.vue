<template>
  <div class="max-w-2xl mx-auto space-y-6 pb-8">
    <div>
      <h1 class="text-heading-lg font-bold text-foreground">
        Edit {{ existingMember?.name ?? "Character" }}
      </h1>
      <p class="text-body text-muted-foreground italic mt-1">Update your hero's details below.</p>
    </div>

    <div class="flex border-b border-border">
      <button v-for="tab in EDIT_TABS" :key="tab.id" type="button"
        class="px-4 py-2 text-label-lg font-semibold transition-colors"
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
            <AppInput v-model="f.name" tone="filled" size="body" placeholder="Aric Stormblade" />
          </label>
          <label class="block">
            <span class="field-label">Player Name</span>
            <AppInput v-model="f.player_name" tone="filled" size="body" :placeholder="auth.membership?.display_name ?? 'Your name'" />
          </label>
        </div>
      </div>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="field-label">Species</span>
          <p v-if="!!f.species_id" class="text-body text-foreground inline">
            {{ currentSpeciesName }}&ensp;<AppButton to="/play/species" variant="link" size="inline" label="Change" />
          </p>
          <AppButton v-else to="/play/species" variant="link" size="inline" label="Browse & Pick a Species" />
        </div>
        <div>
          <span class="field-label">Class</span>
          <p class="text-body text-foreground">
            {{ f.class ?? '—' }}<span v-if="f.subclass" class="text-muted-foreground"> · {{ f.subclass }}</span>
          </p>
        </div>
        <div>
          <span class="field-label">Level</span>
          <p class="text-body text-foreground">{{ f.level }}</p>
        </div>
        <div>
          <span class="field-label">Background</span>
          <p v-if="currentBgName" class="text-body text-foreground inline">
            {{ currentBgName }}&ensp;<AppButton to="/play/background" variant="link" size="inline" label="Change" />
          </p>
          <AppButton v-else to="/play/background" variant="link" size="inline" label="Browse & Pick a Background" />
        </div>
      </div>

      <div>
        <span class="field-label">Notes</span>
        <RichTextEditor v-model="f.notes" placeholder="Background, personality, goals…" size="md" />
      </div>
    </div>

    <!-- Stats -->
    <div v-if="activeTab === 'stats'" class="space-y-4">
      <p class="text-label-lg font-semibold text-muted-foreground uppercase">Ability Scores</p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
          <span class="text-label font-semibold text-muted-foreground">{{ stat.label }}</span>
          <AppInput v-model.number="f[stat.key]" type="number" min="1" max="30" tone="filled" size="body" align="center" class="px-1" />
          <span class="font-cinzel text-xs font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'">
            {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
          </span>
        </label>
      </div>

      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-2">Combat</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block"><span class="field-label">Max HP</span><AppInput v-model.number="f.max_hp" type="number" min="1" tone="filled" size="body" /></label>
        <label class="block"><span class="field-label">Current HP</span><AppInput v-model.number="f.current_hp" type="number" tone="filled" size="body" /></label>
        <label class="block"><span class="field-label">Temp HP</span><AppInput v-model.number="f.temp_hp" type="number" min="0" tone="filled" size="body" /></label>
        <!-- Armor Class — formula picker -->
        <div class="block col-span-2 sm:col-span-3">
          <span class="field-label">Armor Class</span>
          <div class="flex flex-wrap gap-2 items-center">
            <AppSelect v-model="acFormulaType" tone="filled" size="body" weight="normal">
              <option value="">Manual</option>
              <option value="armor">Equipped armor</option>
              <option value="unarmored:dex+con">Unarmored Defense (Barbarian)</option>
              <option value="unarmored:dex+wis">Unarmored Defense (Monk)</option>
              <option value="mage_armor">Mage Armor</option>
              <option value="natural">Natural Armor</option>
              <option value="natural_dex">Natural Armor (base + Dex) — Lizardfolk, Draconic Resilience</option>
            </AppSelect>
            <!-- Editable number: manual mode, or armor mode with nothing derivable equipped -->
            <AppInput v-if="!acFormulaType || (acFormulaType === 'armor' && armorDerivedAc === null)" v-model.number="f.ac" type="number" min="1" tone="filled" size="body" class="w-20" />
            <!-- Formula / derived: computed read-only value + optional natural base input -->
            <template v-else>
              <span class="field-input w-16 text-center font-bold pointer-events-none select-none">{{ acFormulaType === 'armor' ? armorDerivedAc : f.ac }}</span>
              <span class="text-caption text-muted-foreground italic">{{ acFormulaLabel }}</span>
              <AppInput v-if="acFormulaType === 'natural' || acFormulaType === 'natural_dex'" v-model.number="naturalBase" type="number" min="1" tone="filled" size="body" class="w-20" placeholder="Base AC" />
            </template>
          </div>
          <p class="text-caption text-muted-foreground italic mt-1">Without shield — an equipped shield adds its bonus automatically. “Equipped armor” derives base AC from the armor in the paper doll, so it updates when you swap armor.</p>
        </div>
        <label class="block"><span class="field-label">Speed (ft)</span><AppInput v-model.number="f.speed" type="number" min="0" step="5" tone="filled" size="body" /></label>
        <label class="block"><span class="field-label">Initiative Bonus</span><AppInput v-model.number="f.initiative_bonus" type="number" tone="filled" size="body" placeholder="extra on top of DEX (e.g. Alert +5)" /></label>
        <label class="block"><span class="field-label">Carry Capacity Override</span><AppInput v-model="f.carry_capacity_override" type="text" tone="filled" size="body" placeholder="*2, +30, 150" /></label>
      </div>

      <div class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center">
        <div><p class="text-eyebrow text-muted-foreground">PASSIVE PERC.</p><p class="text-heading-sm font-bold">{{ passivePerception }}</p></div>
        <div><p class="text-eyebrow text-muted-foreground">PASSIVE INS.</p><p class="text-heading-sm font-bold">{{ passiveInsight }}</p></div>
        <div><p class="text-eyebrow text-muted-foreground">PASSIVE INV.</p><p class="text-heading-sm font-bold">{{ passiveInvestigation }}</p></div>
      </div>

      <div class="flex items-center justify-between mt-2">
        <p class="text-label-lg font-semibold text-muted-foreground uppercase">Spell Slots (Max per Level)</p>
        <button type="button" class="text-label text-primary/70 hover:text-primary transition-colors" @click="resetSlotsToDefault">Reset to class defaults</button>
      </div>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="lvl in 9" :key="lvl" class="flex flex-col items-center gap-1">
          <span class="text-label font-semibold text-muted-foreground">{{ SLOT_LEVEL_LABELS[lvl - 1] }}</span>
          <AppInput v-model.number="spellSlotMaxes[lvl - 1]" type="number" min="0" max="9" tone="filled" size="body" align="center" class="px-1" />
        </label>
      </div>
    </div>

    <!-- Proficiencies -->
    <div v-if="activeTab === 'profs'" class="space-y-4">
      <p class="text-label-lg font-semibold text-muted-foreground uppercase">Saving Throw Proficiencies</p>
      <div class="grid grid-cols-3 gap-2">
        <AppCheckbox
          v-for="save in SAVE_STATS" :key="save.key"
          :model-value="f.saving_throw_proficiencies.includes(save.key)"
          @update:model-value="toggleSave(save.key)"
        >
          <span>{{ save.label }}</span>
          <span class="ml-2 font-cinzel text-2xs text-muted-foreground">{{ saveBonus(save.key) }}</span>
        </AppCheckbox>
      </div>
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-2">Skills</p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
          <SegmentedControl
            :model-value="f.skill_proficiencies[skill.key] ?? 'none'"
            :options="PROF_LEVELS"
            size="xs"
            class="shrink-0"
            @update:model-value="(v) => setSkillProf(skill.key, v)"
          />
          <span class="text-caption text-foreground flex-1">{{ skill.label }}</span>
          <span class="font-cinzel text-2xs text-muted-foreground shrink-0">{{ skillBonus(skill.key, skill.ability) }}</span>
        </div>
      </div>
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-4">Tool Proficiencies</p>
      <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" @update:model-value="f.tool_proficiencies = $event" />
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-3">Languages</p>
      <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" @update:model-value="f.languages = $event" />
    </div>

    <div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <AppButton variant="subtle" size="md" label="Cancel" @click="router.push(backRoute)" />
      <AppButton
        variant="primary"
        size="md"
        class="min-w-28"
        :label="saving ? 'Saving…' : 'Save Changes'"
        :disabled="!f.name.trim() || saving"
        @click="save()"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed, watch } from "vue";
import { CHARACTER_FORM_KEY } from "@/composables/party/useCharacterCreationForm";
import { useShieldAcBonus } from "@/composables/party/useShieldAc";
import { armorAcFor } from "@/rules/armorAc";
import type { PartyMember } from "@/types/party.types";
import { EDIT_TABS, ABILITY_STATS, SAVE_STATS, PROF_LEVELS, SLOT_LEVEL_LABELS } from "@/rules/characterCreation";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import AppButton from "@/components/common/AppButton.vue";
import AppCheckbox from "@/components/common/AppCheckbox.vue";
import AppInput from "@/components/common/AppInput.vue";
import AppSelect from "@/components/common/AppSelect.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import SegmentedControl from "@/components/common/SegmentedControl.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const {
  router, auth, f,
  activeTab, saving,
  portraitUrl, focalPoint, spellSlotMaxes,
  existingMember, backRoute,
  backgroundOptions, selectedSpecies,
  passivePerception, passiveInsight, passiveInvestigation,
  mod, setSkillProf, skillBonus, toggleSave, saveBonus,
  resetSlotsToDefault,
  save,
} = form;

// Resolve off `selectedSpecies` (the ungated list), not `speciesOptions` — a
// species the DM disabled after this character picked it is gone from the
// picker but still theirs, and must still render by name (#566).
const currentSpeciesName = computed(
  () => (selectedSpecies.value as { name: string } | null)?.name ?? "—",
);
const currentBgName = computed(
  () => (backgroundOptions.value as Array<{ id: string; name: string }>).find((b) => b.id === f.background_id)?.name ?? null,
);

// ── AC formula picker ─────────────────────────────────────────────────────────

/** Dropdown value: "" = manual, "natural" = natural armor, "natural_dex" =
 *  natural armor + Dex (Lizardfolk, Draconic Resilience), else the formula string. */
const acFormulaType = computed({
  get(): string {
    const fm = f.ac_formula;
    if (!fm) return "";
    if (fm.startsWith("natural:")) return fm.endsWith("+dex") ? "natural_dex" : "natural";
    return fm;
  },
  set(val: string) {
    if (val === "") {
      f.ac_formula = null;
    } else if (val === "natural" || val === "natural_dex") {
      // Seed from species natural_armor_ac if available, else 10.
      const speciesBase = (selectedSpecies.value as { natural_armor_ac?: number | null } | null)?.natural_armor_ac ?? 10;
      f.ac_formula = `natural:${speciesBase}${val === "natural_dex" ? "+dex" : ""}`;
    } else {
      f.ac_formula = val;
    }
  },
});

/** The base AC integer for the natural armor option (with or without +Dex). */
const naturalBase = computed({
  get(): number {
    const fm = f.ac_formula;
    if (fm?.startsWith("natural:")) {
      const match = fm.match(/^natural:(\d+)(\+dex)?$/);
      return match ? parseInt(match[1], 10) : 10;
    }
    return (selectedSpecies.value as { natural_armor_ac?: number | null } | null)?.natural_armor_ac ?? 10;
  },
  set(val: number) {
    f.ac_formula = `natural:${val}${acFormulaType.value === "natural_dex" ? "+dex" : ""}`;
  },
});

// ── Equipped-armor derivation (live preview) ──────────────────────────────────
// Mirrors the display-time resolver so the editor shows exactly what the sheets
// will. Keyed by the saved member id, so it only resolves in edit mode.
const { armorFor } = useShieldAcBonus();
const equippedArmor = computed(() => armorFor((existingMember.value as PartyMember | null)?.id));
const armorDerivedAc = computed(() =>
  equippedArmor.value ? armorAcFor(equippedArmor.value, f.dex) : null,
);
const armorAcLabel = computed(() => {
  const a = equippedArmor.value;
  if (!a) return "";
  if (a.dex === "none") return `${a.base} (no DEX)`;
  const dm = mod(f.dex);
  const applied = a.dex === "capped" ? Math.min(dm, a.maxDex ?? 0) : dm;
  const cap = a.dex === "capped" ? ` (max +${a.maxDex})` : "";
  return `${a.base} + DEX (${applied >= 0 ? "+" : ""}${applied})${cap}`;
});

// Keep the stored `ac` synced to the derived value while "armor" mode is active,
// so it stays a sensible fallback if the armor is later unequipped/unparseable.
watch([armorDerivedAc, acFormulaType], () => {
  if (acFormulaType.value === "armor" && armorDerivedAc.value !== null) {
    f.ac = armorDerivedAc.value;
  }
});

const acFormulaLabel = computed(() => {
  const fm = f.ac_formula;
  if (!fm) return "";
  if (fm === "armor")             return armorDerivedAc.value === null ? "No armor equipped — enter AC manually" : armorAcLabel.value;
  if (fm === "unarmored:dex+con") return `10 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)}) + CON (${mod(f.con) >= 0 ? "+" : ""}${mod(f.con)})`;
  if (fm === "unarmored:dex+wis") return `10 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)}) + WIS (${mod(f.wis) >= 0 ? "+" : ""}${mod(f.wis)})`;
  if (fm === "mage_armor")        return `13 + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)})`;
  if (fm.startsWith("natural:")) {
    return fm.endsWith("+dex")
      ? `Natural Armor — base + DEX (${mod(f.dex) >= 0 ? "+" : ""}${mod(f.dex)}):`
      : "Natural Armor — base:";
  }
  return "";
});
</script>

<style scoped>
@reference "@/assets/main.css";
.field-label {
  @apply block text-label-lg font-semibold text-muted-foreground mb-1;
}
.field-input {
  @apply bg-muted border border-border rounded-md px-3 py-1.5 text-body text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}
</style>
