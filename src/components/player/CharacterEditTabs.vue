<template>
  <div class="max-w-2xl mx-auto space-y-6 pb-8">
    <div>
      <h1 class="text-heading-lg font-bold text-foreground">
        Edit {{ existingMember?.name ?? "Character" }}
      </h1>
      <p class="text-body text-muted-foreground italic mt-1">Changes save as you make them.</p>
      <AutosaveStatus
        v-if="autosave"
        :status="autosave.status.value"
        :error="autosave.saveError.value"
        paused-label="Autosave paused until the character has a name"
        class="mt-1"
      />
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

      <!-- Read-only: an edition changes only through conversion, never by editing the sheet. -->
      <p v-if="existingMember" class="text-caption text-muted-foreground">
        Built with {{ rulesetLabel(existingMember.ruleset) }}
      </p>

      <div class="grid grid-cols-2 gap-3">
        <div>
          <span class="field-label">Species</span>
          <p v-if="!!f.species_id" class="text-body text-foreground inline">
            {{ currentSpeciesName }}&ensp;<AppButton :to="pickerRoute('play-species')" variant="link" size="inline" label="Change" />
          </p>
          <AppButton v-else :to="pickerRoute('play-species')" variant="link" size="inline" label="Browse & Pick a Species" />
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
            {{ currentBgName }}&ensp;<AppButton :to="pickerRoute('play-background')" variant="link" size="inline" label="Change" />
          </p>
          <AppButton v-else :to="pickerRoute('play-background')" variant="link" size="inline" label="Browse & Pick a Background" />
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
          <span class="text-label-lg font-bold" :class="mod(f[stat.key]) >= 0 ? 'text-ink-success' : 'text-destructive'">
            {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
          </span>
        </label>
      </div>

      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-2">Combat</p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block"><span class="field-label">Max HP</span><AppInput v-model.number="f.max_hp" type="number" min="1" tone="filled" size="body" /></label>
        <label class="block"><span class="field-label">Current HP</span><AppInput v-model.number="f.current_hp" type="number" tone="filled" size="body" /></label>
        <label class="block"><span class="field-label">Temp HP</span><AppInput v-model.number="f.temp_hp" type="number" min="0" tone="filled" size="body" /></label>
        <AcFormField
          v-model="f.ac_formula"
          class="col-span-2 sm:col-span-3"
          :breakdown="acBreakdown"
          :natural-seed="naturalSeed"
        />
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
          <span class="ml-2 text-label text-muted-foreground">{{ saveBonus(save.key) }}</span>
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
          <span class="text-label text-muted-foreground shrink-0">{{ skillBonus(skill.key, skill.ability) }}</span>
        </div>
      </div>
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-4">Tool Proficiencies</p>
      <TagPickerInput :model-value="f.tool_proficiencies" :groups="TOOL_PROFICIENCY_GROUPS" placeholder="Search tools…" @update:model-value="f.tool_proficiencies = $event" />
      <p class="text-label-lg font-semibold text-muted-foreground uppercase mt-3">Languages</p>
      <TagPickerInput :model-value="f.languages" :groups="LANGUAGE_GROUPS" placeholder="Search languages…" @update:model-value="f.languages = $event" />
    </div>

    <p v-if="freeSpeciesPicks.length > 0" class="text-body text-muted-foreground">
      Your species lets you choose {{ freeSpeciesPicks.length === 1 ? "a spell" : "spells" }} of your own.
      <AppButton :to="{ path: '/play/spells', query: { tab: 'innate' } }" variant="link" size="inline" label="Choose species spells" />
    </p>

    <div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <AppButton variant="primary" size="md" class="min-w-28" label="Done" @click="finishEditing()" />
    </div>
  </div>
</template>

<script setup lang="ts">
import { inject, computed } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { CHARACTER_FORM_KEY } from "@/composables/party/useCharacterCreationForm";
import { rulesetLabel } from "@/composables/party/useCharacterRuleset";
import { useArmorClass } from "@/composables/party/useArmorClass";
import AcFormField from "@/components/party/AcFormField.vue";
import type { PartyMember } from "@/types/party.types";
import { EDIT_TABS, ABILITY_STATS, SAVE_STATS, PROF_LEVELS, SLOT_LEVEL_LABELS } from "@/rules/characterCreation";
import { SKILLS } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import AutosaveStatus from "@/components/common/feedback/AutosaveStatus.vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import AppCheckbox from "@/components/common/controls/AppCheckbox.vue";
import AppInput from "@/components/common/controls/AppInput.vue";
import ImageUpload from "@/components/common/media/ImageUpload.vue";
import RichTextEditor from "@/components/common/richtext/RichTextEditor.vue";
import SegmentedControl from "@/components/common/controls/SegmentedControl.vue";
import TagPickerInput from "@/components/common/controls/TagPickerInput.vue";

const form = inject(CHARACTER_FORM_KEY)!;
const {
  auth, f,
  activeTab,
  portraitUrl, focalPoint, spellSlotMaxes,
  existingMember, chosenRuleset,
  backgroundOptions, selectedSpecies,
  passivePerception, passiveInsight, passiveInvestigation,
  mod, setSkillProf, skillBonus, toggleSave, saveBonus,
  resetSlotsToDefault,
  autosave, finishEditing, freeSpeciesPicks,
} = form;

// Leaving by any route (a picker link, the tab bar, back) writes what is pending
// first, so an edit made a moment ago is never lost to the debounce.
onBeforeRouteLeave(async () => { await autosave?.saveNow(); });

// The pickers edit the ACTIVE character unless told which one, and this page may
// be open on a character that is not (a benched one, or one the DM is managing).
function pickerRoute(name: "play-species" | "play-background") {
  return { name, query: existingMember.value ? { memberId: existingMember.value.id } : {} };
}

// Resolve off `selectedSpecies` (the ungated list), not `speciesOptions` — a
// species the DM disabled after this character picked it is gone from the
// picker but still theirs, and must still render by name (#566).
const currentSpeciesName = computed(
  () => (selectedSpecies.value as { name: string } | null)?.name ?? "—",
);
const currentBgName = computed(
  () => (backgroundOptions.value as Array<{ id: string; name: string }>).find((b) => b.id === f.background_id)?.name ?? null,
);

// ── Armor Class ───────────────────────────────────────────────────────────────
// Worked out from the form's own scores and the character's gear, so the editor
// shows what the sheets will. Gear is keyed by the saved member id: a character
// that does not exist yet has none.
const { acBreakdownFor } = useArmorClass();
const naturalSeed = computed(
  () => (selectedSpecies.value as { natural_armor_ac?: number | null } | null)?.natural_armor_ac ?? null,
);
const acBreakdown = computed(() =>
  acBreakdownFor({
    id: (existingMember.value as PartyMember | null)?.id ?? "",
    ruleset: (existingMember.value as PartyMember | null)?.ruleset ?? chosenRuleset.value,
    class: f.class,
    subclass: f.subclass,
    class_choices: f.class_choices,
    dex: f.dex,
    con: f.con,
    wis: f.wis,
    cha: f.cha,
    ac_formula: f.ac_formula,
  }),
);
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
