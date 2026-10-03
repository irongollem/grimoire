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
          :spell-slot-maxes="spellSlotMaxes"
          :skill-proficiencies="form.skill_proficiencies"
          :prof-bonus="profBonus"
          @update:form="applyAbilitiesPatch"
          @update:spell-slot-max="(i, v) => { spellSlotMaxes[i] = v; }"
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
import { ref, reactive, computed } from "vue";
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

const activeTab = ref<TabId>("identity");

// Portrait
const portraitUrl = ref(props.member.portrait_url ?? "");
const focalPoint  = ref<{ x: number; y: number } | null>(props.member.portrait_focal_point ?? null);

// Only the fields these four tabs edit. Everything else on the row (hp in a
// fight, conditions, class resources...) is left out of the save on purpose, so
// saving here cannot overwrite what the table changed while the form was open.
// Class, subclass and level are not here either: they are read from the class
// rows and change only through level-up or de-level.
const form = reactive({
  name: props.member.name,
  player_name: props.member.player_name,
  max_hp: props.member.max_hp,
  current_hp: props.member.current_hp,
  temp_hp: props.member.temp_hp,
  ac: props.member.ac,
  speed: props.member.speed,
  initiative_bonus: props.member.initiative_bonus,
  str: props.member.str,
  dex: props.member.dex,
  con: props.member.con,
  int: props.member.int,
  wis: props.member.wis,
  cha: props.member.cha,
  skill_proficiencies: { ...props.member.skill_proficiencies },
  saving_throw_proficiencies: [...props.member.saving_throw_proficiencies],
  tool_proficiencies: [...props.member.tool_proficiencies],
  languages: [...props.member.languages],
  carry_capacity_override: props.member.carry_capacity_override,
  species_id: props.member.species_id,
  disguise_species_id: props.member.disguise_species_id,
  disguise_race: props.member.disguise_race,
  disguise_subrace: props.member.disguise_subrace,
  background_id: props.member.background_id,
  // The text controls below bind to a string, while the columns are nullable
  // (or absent on older rows). The empty string stands for "none" while editing
  // and is turned back into null at save.
  subrace: props.member.subrace ?? "",
  notes: props.member.notes ?? "",
  height: props.member.height ?? null,
  alignment: props.member.alignment ?? "",
  deity: props.member.deity ?? "",
  deity_id: props.member.deity_id ?? null,
  age: props.member.age ?? "",
  gender: props.member.gender ?? "",
  pronouns: props.member.pronouns ?? "",
  physical_description: props.member.physical_description ?? "",
  personality_traits: props.member.personality_traits ?? "",
  ideals: props.member.ideals ?? "",
  bonds: props.member.bonds ?? "",
  flaws: props.member.flaws ?? "",
});

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
  ac: form.ac,
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
function buildSlotMaxes(existing: SpellSlotEntry[] | undefined): number[] {
  const slots = existing && existing.length > 0
    ? existing
    : deriveEffectiveSpellSlots(
        { ...props.member, spell_slots: null },
        characterClassRows.value ?? [],
        ruleset.value,
        (row) => {
          const definitions = row.class_definition_kind === "custom" ? customClasses.value : systemClasses.value;
          return definitions.find((c) => c.id === row.class_definition_id);
        },
      );
  return Array.from({ length: 9 }, (_, i) => slots.find((s) => s.level === i + 1)?.max ?? 0);
}

const spellSlotMaxes = reactive<number[]>(buildSlotMaxes(props.member.spell_slots));

function resetSlotsToDefault() {
  buildSlotMaxes(undefined).forEach((v, i) => { spellSlotMaxes[i] = v; });
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

async function save() {
  if (saving.value) return;
  saving.value = true;
  const selectedPlayer = players.value.find((m) => m.id === selectedCampaignMemberId.value);
  const payload: PartyMemberUpdate = {
    name: form.name.trim(),
    player_name: selectedPlayer?.display_name ?? (form.player_name || null),
    subrace: form.subrace || null,
    notes: form.notes || null,
    portrait_url: portraitUrl.value || null,
    portrait_focal_point: focalPoint.value,
    proficiency_bonus: profBonus.value,
    max_hp: form.max_hp,
    current_hp: form.current_hp,
    temp_hp: form.temp_hp,
    ac: form.ac,
    speed: form.speed,
    initiative_bonus: form.initiative_bonus,
    str: form.str,
    dex: form.dex,
    con: form.con,
    int: form.int,
    wis: form.wis,
    cha: form.cha,
    skill_proficiencies: form.skill_proficiencies,
    saving_throw_proficiencies: form.saving_throw_proficiencies,
    tool_proficiencies: form.tool_proficiencies,
    languages: form.languages,
    carry_capacity_override: form.carry_capacity_override,
    species_id: form.species_id,
    disguise_species_id: form.disguise_species_id,
    disguise_race: form.disguise_race,
    disguise_subrace: form.disguise_subrace,
    background_id: form.background_id,
    height: form.height,
    alignment:            form.alignment            || null,
    deity:                form.deity                || null,
    deity_id:             form.deity_id,
    age:                  form.age                  || null,
    gender:               form.gender               || null,
    pronouns:             form.pronouns             || null,
    physical_description: form.physical_description || null,
    personality_traits:   form.personality_traits   || null,
    ideals:               form.ideals               || null,
    bonds:                form.bonds                || null,
    flaws:                form.flaws                || null,
    spell_slots: spellSlotMaxes
      .map((max, i) => {
        const existing = props.member.spell_slots?.find((s: SpellSlotEntry) => s.level === i + 1);
        return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
      })
      .filter((s) => s.max > 0),
  };

  try {
    const partyMemberId = props.member.id;
    await update({ id: partyMemberId, update: payload });

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
