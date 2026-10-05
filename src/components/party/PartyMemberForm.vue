<template>
  <!-- Modal backdrop -->
  <div class="fixed inset-0 z-50 flex items-start justify-end">
    <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
    <div
      class="relative z-10 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0">
        <h2 class="text-heading-sm font-bold text-foreground">
          {{ `Edit ${props.member.name}` }}
        </h2>
        <AppButton variant="ghost" size="icon-xs" icon-size="md" :icon="IconClose" aria-label="Close" @click="emit('close')" />
      </div>

      <!-- Tabs -->
      <TabBar
        :tabs="TABS"
        :model-value="activeTab"
        wrapper-class="shrink-0"
        @update:model-value="activeTab = $event"
      />

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <PartyMemberIdentityTab
          v-if="activeTab === 'identity'"
          :form="identitySlice"
          :portrait-url="portraitUrl"
          :focal-point="focalPoint"
          :players="players"
          :selected-campaign-member-id="selectedCampaignMemberId"
          :species-options="speciesOptions"
          :subrace-options="subraceOptions"
          :disguise-subrace-options="disguiseSubraceOptions"
          :is-shapeshifter="!!selectedSpecies?.is_shapeshifter"
          :multiclass-label="multiclassLabel"
          :level="level"
          :member-id="memberId"
          :prof-bonus="profBonus"
          :all-species-map="allSpeciesMap"
          @update:form="applyIdentityPatch"
          @update:portrait-url="portraitUrl = $event"
          @update:focal-point="focalPoint = $event"
          @update:selected-campaign-member-id="selectedCampaignMemberId = $event"
          @close="emit('close')"
        />

        <PartyMemberAbilitiesTab
          v-if="activeTab === 'stats'"
          :form="abilitiesSlice"
          :ac-breakdown="acBreakdown"
          :natural-seed="selectedSpecies?.natural_armor_ac ?? null"
          :spell-slot-maxes="spellSlotMaxes"
          :skill-proficiencies="form.skill_proficiencies"
          :prof-bonus="profBonus"
          @update:form="applyAbilitiesPatch"
          @update:spell-slot-max="setSlotMax"
          @reset-slots="resetSlotsToDefault"
        />

        <PartyMemberProficienciesTab
          v-if="activeTab === 'profs'"
          :form="proficienciesSlice"
          :prof-bonus="profBonus"
          @update:form="applyProficienciesPatch"
        />

        <PartyMemberPersonaTab
          v-if="activeTab === 'persona'"
          :form="personaSlice"
          @update:form="applyPersonaPatch"
        />
      </div>

      <DraftConflictNotice :fields="conflictLabels" :on-discard="reset" class="mx-5 mb-3 shrink-0" />

      <!-- Footer -->
      <div class="flex items-center justify-between gap-2 px-5 py-4 border-t border-border shrink-0">
        <AppButton
          variant="link"
          tone="danger"
          size="inline-xs"
          :disabled="saving"
          :label="props.member.owner_user_id ? 'Detach from party' : 'Remove from party'"
          @click="remove"
        />
        <div class="flex gap-2 ml-auto">
          <AppButton variant="subtle" size="md" label="Cancel" @click="emit('close')" />
          <AppButton
            variant="primary"
            size="md"
            :disabled="!form.name.trim() || saving"
            label="Save Changes"
            @click="save"
          />
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, computed } from "vue";
import { useRecordDraft } from "@/composables/useRecordDraft";
import DraftConflictNotice from "@/components/common/DraftConflictNotice.vue";
import { IconClose } from "@/lib/icons";
import AppButton from "@/components/common/AppButton.vue";
import TabBar from "@/components/common/TabBar.vue";
import PartyMemberIdentityTab from "./PartyMemberIdentityTab.vue";
import PartyMemberAbilitiesTab from "./PartyMemberAbilitiesTab.vue";
import PartyMemberProficienciesTab from "./PartyMemberProficienciesTab.vue";
import PartyMemberPersonaTab from "./PartyMemberPersonaTab.vue";
import { provideCharacterRuleset, useRuleset } from "@/composables/rules/useRuleset";
import { useCampaignSpecies } from "@/composables/rules/useSpecies";
import {
  useUpdatePartyMember,
  useDeletePartyMember,
} from "@/composables/party/useParty";
import { useDetachCharacter } from "@/composables/party/useCharacterPool";
import {
  useCampaignMembers,
  useUpdateCampaignMember,
} from "@/composables/campaign/useCampaignMembers";
import { useCampaignSystemClasses, useCampaignCustomClasses } from "@/composables/rules/useCustomClasses";
import { useCharacterClasses } from "@/composables/party/useCharacterClasses";
import { useArmorClass } from "@/composables/party/useArmorClass";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type { PartyMember, PartyMemberUpdate, SpellSlotEntry } from "@/types/party.types";
import { deriveEffectiveSpellSlots } from "@/rules/spellSlots";
import type { IdentityFormSlice, AbilitiesFormSlice, ProficienciesFormSlice, PersonaFormSlice } from "./partyMemberForm.types";

const TABS = [
  { id: "identity" as const, label: "Identity" },
  { id: "stats" as const, label: "Stats" },
  { id: "profs" as const, label: "Proficiencies" },
  { id: "persona" as const, label: "Persona" },
] as const;

type TabId = typeof TABS[number]["id"];

// Edits a hero that exists. A new hero is made in the character wizard
// (`/party/new`), which asks the edition first and knows which campaign it is
// for. This form used to carry a create branch as well; nothing mounted it
// without a member, and it inserted a character with neither a campaign nor an
// edition, which the database refuses since #943.
const props = defineProps<{ member: PartyMember }>();
const emit = defineEmits<{ close: [] }>();

// The species and class pickers resolve against the hero's own edition (useRuleset.ts).
provideCharacterRuleset(() => props.member);
const { ruleset } = useRuleset();

// Multiclass / builder data
const memberId = computed(() => props.member.id);
const { data: characterClassRows } = useCharacterClasses(memberId);
const hasClasses = computed(() => (characterClassRows.value?.length ?? 0) > 0);
const multiclassLabel = computed(() => formatMulticlassLabel(characterClassRows.value ?? []));
const multiclassTotal = computed(() => totalLevel(characterClassRows.value ?? []));
const { data: systemClasses } = useCampaignSystemClasses();
const { data: customClasses } = useCampaignCustomClasses();

// Pickers offer only what the campaign permits; `allSpecies` (ungated) still
// backs name resolution below, so a member keeps their species after the DM
// disables it (#566).
const { data: campaignSpecies, all: allSpecies } = useCampaignSpecies();
const speciesOptions = computed(() => campaignSpecies.value.map((s) => ({ id: s.id, name: s.name })));

const allSpeciesMap = computed<Record<string, string>>(() =>
  Object.fromEntries((allSpecies.value ?? []).map(s => [s.id, s.name])),
);

const selectedSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === form.species_id) ?? null);
const subraceOptions  = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

const selectedDisguiseSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === form.disguise_species_id) ?? null);
const disguiseSubraceOptions  = computed(() => selectedDisguiseSpecies.value?.subraces?.map(sr => sr.name) ?? []);

// The AC the hero has right now, with the form's unsaved scores and formula, so
// the DM sees the effect of a Dexterity change before saving. Gear comes from the
// inventory; nothing here edits it.
const { acBreakdownFor } = useArmorClass();
const acBreakdown = computed(() =>
  acBreakdownFor({
    id: props.member.id,
    ruleset: props.member.ruleset,
    class: props.member.class,
    subclass: props.member.subclass,
    class_choices: props.member.class_choices,
    dex: form.dex,
    con: form.con,
    wis: form.wis,
    cha: form.cha,
    ac_formula: form.ac_formula,
  }),
);

const activeTab = ref<TabId>("identity");

// Only the fields these four tabs edit. Everything else on the row (conditions,
// class resources...) is left out of the save on purpose, so saving here cannot
// overwrite what the table changed while the form was open. Class, subclass and
// level are not here either: they are read from the class rows and change only
// through level-up or de-level.
//
// The draft also carries the portrait and the spell slots, and the slots'
// "used" counts, which a live session spends and this form never edits: with
// them in the draft, an untouched count is neither sent nor reverted (#946).
function toMemberDraft(m: PartyMember) {
  return {
    name: m.name,
    player_name: m.player_name,
    max_hp: m.max_hp,
    current_hp: m.current_hp,
    temp_hp: m.temp_hp,
    ac_formula: m.ac_formula ?? null,
    speed: m.speed,
    initiative_bonus: m.initiative_bonus,
    str: m.str,
    dex: m.dex,
    con: m.con,
    int: m.int,
    wis: m.wis,
    cha: m.cha,
    skill_proficiencies: { ...m.skill_proficiencies },
    saving_throw_proficiencies: [...m.saving_throw_proficiencies],
    tool_proficiencies: [...m.tool_proficiencies],
    languages: [...m.languages],
    carry_capacity_override: m.carry_capacity_override,
    species_id: m.species_id,
    disguise_species_id: m.disguise_species_id,
    disguise_race: m.disguise_race,
    disguise_subrace: m.disguise_subrace,
    background_id: m.background_id,
    // The text controls below bind to a string, while the columns are nullable
    // (or absent on older rows). The empty string stands for "none" while editing
    // and is turned back into null at save.
    subrace: m.subrace ?? "",
    notes: m.notes ?? "",
    height: m.height ?? null,
    alignment: m.alignment ?? "",
    deity: m.deity ?? "",
    deity_id: m.deity_id ?? null,
    age: m.age ?? "",
    gender: m.gender ?? "",
    pronouns: m.pronouns ?? "",
    physical_description: m.physical_description ?? "",
    personality_traits: m.personality_traits ?? "",
    ideals: m.ideals ?? "",
    bonds: m.bonds ?? "",
    flaws: m.flaws ?? "",
    portraitUrl: m.portrait_url ?? "",
    focalPoint: m.portrait_focal_point ? { ...m.portrait_focal_point } : (null as { x: number; y: number } | null),
    spellSlotMaxes: buildSlotMaxes(m, m.spell_slots),
    spellSlotsUsed: Array.from({ length: 9 }, (_, i) => m.spell_slots?.find((s) => s.level === i + 1)?.used ?? 0),
  };
}
type MemberDraft = ReturnType<typeof toMemberDraft>;

const { draft: form, changes, commit, reset, conflicts } = useRecordDraft({
  source: () => props.member,
  identity: (m: PartyMember) => m.id,
  toDraft: (m): MemberDraft => toMemberDraft(m ?? props.member),
});

const CONFLICT_LABELS: Partial<Record<keyof MemberDraft, string>> = {
  name: "Name", player_name: "Player", max_hp: "Max HP", current_hp: "Current HP", temp_hp: "Temp HP",
  ac_formula: "AC calculation", speed: "Speed", initiative_bonus: "Initiative", str: "Strength", dex: "Dexterity",
  con: "Constitution", int: "Intelligence", wis: "Wisdom", cha: "Charisma",
  skill_proficiencies: "Skill proficiencies", saving_throw_proficiencies: "Saving throws",
  tool_proficiencies: "Tool proficiencies", languages: "Languages",
  carry_capacity_override: "Carry capacity", species_id: "Species", disguise_species_id: "Disguise species",
  disguise_race: "Disguise race", disguise_subrace: "Disguise subrace", background_id: "Background",
  subrace: "Subrace", notes: "Notes", height: "Height", alignment: "Alignment", deity: "Deity",
  deity_id: "Deity", age: "Age", gender: "Gender", pronouns: "Pronouns",
  physical_description: "Physical description", personality_traits: "Personality traits",
  ideals: "Ideals", bonds: "Bonds", flaws: "Flaws", portraitUrl: "Portrait", focalPoint: "Portrait",
  spellSlotMaxes: "Spell slots", spellSlotsUsed: "Spell slots used",
};
const conflictLabels = computed(() => [
  ...new Set(conflicts.value.map((k) => CONFLICT_LABELS[k]).filter((l): l is string => !!l)),
]);

// Views onto the draft for the portrait and slots. Computed, not captured
// references: a merge can replace the array or object whole.
const portraitUrl = computed({
  get: () => form.portraitUrl,
  set: (v: string) => { form.portraitUrl = v; },
});
const focalPoint = computed({
  get: () => form.focalPoint,
  set: (v: { x: number; y: number } | null) => { form.focalPoint = v; },
});
const spellSlotMaxes = computed(() => form.spellSlotMaxes);

// Total level: the sum of the class rows, or the row's own level for a
// classless character (which has no rows to sum).
const level = computed(() => (hasClasses.value ? multiclassTotal.value : props.member.level));

// --- Computed slices for each tab ---
const identitySlice = computed<IdentityFormSlice>(() => ({
  name: form.name,
  player_name: form.player_name,
  subrace: form.subrace,
  species_id: form.species_id,
  disguise_species_id: form.disguise_species_id,
  disguise_race: form.disguise_race,
  disguise_subrace: form.disguise_subrace,
  background_id: form.background_id,
  height: form.height,
  notes: form.notes,
}));

const abilitiesSlice = computed<AbilitiesFormSlice>(() => ({
  str: form.str,
  dex: form.dex,
  con: form.con,
  int: form.int,
  wis: form.wis,
  cha: form.cha,
  max_hp: form.max_hp,
  current_hp: form.current_hp,
  temp_hp: form.temp_hp,
  ac_formula: form.ac_formula,
  speed: form.speed,
  initiative_bonus: form.initiative_bonus,
  carry_capacity_override: form.carry_capacity_override,
}));

const proficienciesSlice = computed<ProficienciesFormSlice>(() => ({
  skill_proficiencies: form.skill_proficiencies,
  saving_throw_proficiencies: form.saving_throw_proficiencies,
  tool_proficiencies: form.tool_proficiencies,
  languages: form.languages,
  str: form.str,
  dex: form.dex,
  con: form.con,
  int: form.int,
  wis: form.wis,
  cha: form.cha,
}));

const personaSlice = computed<PersonaFormSlice>(() => ({
  alignment:            form.alignment,
  deity:                form.deity,
  deity_id:             form.deity_id,
  age:                  form.age,
  gender:               form.gender,
  pronouns:             form.pronouns,
  physical_description: form.physical_description,
  personality_traits:   form.personality_traits,
  ideals:               form.ideals,
  bonds:                form.bonds,
  flaws:                form.flaws,
}));

// --- Patch appliers ---
function applyIdentityPatch(patch: Partial<IdentityFormSlice>) {
  Object.assign(form, patch);
}

function applyAbilitiesPatch(patch: Partial<AbilitiesFormSlice>) {
  Object.assign(form, patch);
}

function applyProficienciesPatch(patch: Partial<ProficienciesFormSlice>) {
  Object.assign(form, patch);
}

function applyPersonaPatch(patch: Partial<PersonaFormSlice>) {
  Object.assign(form, patch);
}

// --- Spell slots ---
// Defaults are derived from the character's class rows and its own edition,
// multiclass included, the same way the sheet derives them.
function buildSlotMaxes(member: PartyMember, existing: SpellSlotEntry[] | undefined): number[] {
  const slots = existing && existing.length > 0
    ? existing
    : deriveEffectiveSpellSlots(
        { ...member, spell_slots: null },
        characterClassRows.value ?? [],
        ruleset.value,
        (row) => {
          const definitions = row.class_definition_kind === "custom" ? customClasses.value : systemClasses.value;
          return definitions.find((c) => c.id === row.class_definition_id);
        },
      );
  return Array.from({ length: 9 }, (_, i) => slots.find((s) => s.level === i + 1)?.max ?? 0);
}

function resetSlotsToDefault() {
  buildSlotMaxes(props.member, undefined).forEach((v, i) => { spellSlotMaxes.value[i] = v; });
}

function setSlotMax(index: number, value: number) {
  spellSlotMaxes.value[index] = value;
}

// --- Proficiency bonus ---
const profBonus = computed(() => {
  const l = level.value;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9) return 4;
  if (l >= 5) return 3;
  return 2;
});

// --- Campaign members ---
const { data: campaignMembers } = useCampaignMembers();
const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

const players = computed(() =>
  (campaignMembers.value ?? []).filter((m) => m.role === "player"),
);

const selectedCampaignMemberId = ref<string>(
  (campaignMembers.value ?? []).find(
    (m) => m.party_member_id === props.member.id,
  )?.id ?? "",
);

// --- CRUD ---
const { mutateAsync: update } = useUpdatePartyMember();
const { mutateAsync: del } = useDeletePartyMember();
const { mutateAsync: detach } = useDetachCharacter();

const saving = ref(false);

// The member row for a draft. Pure: useRecordDraft runs it over the draft and
// over the server copy to find the columns the user changed.
function buildPayload(d: MemberDraft): PartyMemberUpdate {
  return {
    name: d.name.trim(),
    player_name: d.player_name || null,
    subrace: d.subrace || null,
    notes: d.notes || null,
    portrait_url: d.portraitUrl || null,
    portrait_focal_point: d.focalPoint,
    max_hp: d.max_hp,
    current_hp: d.current_hp,
    temp_hp: d.temp_hp,
    ac_formula: d.ac_formula,
    speed: d.speed,
    initiative_bonus: d.initiative_bonus,
    str: d.str,
    dex: d.dex,
    con: d.con,
    int: d.int,
    wis: d.wis,
    cha: d.cha,
    skill_proficiencies: d.skill_proficiencies,
    saving_throw_proficiencies: d.saving_throw_proficiencies,
    tool_proficiencies: d.tool_proficiencies,
    languages: d.languages,
    carry_capacity_override: d.carry_capacity_override,
    species_id: d.species_id,
    disguise_species_id: d.disguise_species_id,
    disguise_race: d.disguise_race,
    disguise_subrace: d.disguise_subrace,
    background_id: d.background_id,
    height: d.height,
    alignment:            d.alignment            || null,
    deity:                d.deity                || null,
    deity_id:             d.deity_id,
    age:                  d.age                  || null,
    gender:               d.gender               || null,
    pronouns:             d.pronouns             || null,
    physical_description: d.physical_description || null,
    personality_traits:   d.personality_traits   || null,
    ideals:               d.ideals               || null,
    bonds:                d.bonds                || null,
    flaws:                d.flaws                || null,
    spell_slots: d.spellSlotMaxes
      .map((max, i) => ({ level: i + 1, max, used: max > 0 ? d.spellSlotsUsed[i] : 0 }))
      .filter((s) => s.max > 0),
  };
}

async function save() {
  if (saving.value) return;
  saving.value = true;
  // The chosen player's display name wins over the typed one. It is the player
  // list's, not the draft's, so it lands in the draft here, before the builder runs.
  const selectedPlayer = players.value.find((m) => m.id === selectedCampaignMemberId.value);
  if (selectedPlayer) form.player_name = selectedPlayer.display_name;

  try {
    const partyMemberId = props.member.id;
    const changed = changes(buildPayload);
    // Derived from the class rows, not edited here, so it is compared to the row directly.
    if (profBonus.value !== props.member.proficiency_bonus) changed.proficiency_bonus = profBonus.value;
    if (Object.keys(changed).length > 0) {
      await update({ id: partyMemberId, update: changed });
    }
    commit();

    for (const m of players.value) {
      if (m.party_member_id === partyMemberId && m.id !== selectedCampaignMemberId.value) {
        await updateCampaignMember({ id: m.id, update: { party_member_id: null } });
      }
    }
    if (selectedCampaignMemberId.value) {
      await updateCampaignMember({
        id: selectedCampaignMemberId.value,
        update: { party_member_id: partyMemberId },
      });
    }

    emit("close");
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (saving.value) return;
  const claimed = !!props.member.owner_user_id;
  const action = claimed ? "Detach" : "Remove";
  if (!await confirm(
    claimed
      ? `Detach ${props.member.name} from the party? The character returns to its owner's pool.`
      : `Remove ${props.member.name} from the party?`,
    { title: `${action} character?`, confirmLabel: action, danger: !claimed },
  )) return;
  saving.value = true;
  try {
    if (claimed) await detach(props.member.id);
    else await del(props.member);
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>
