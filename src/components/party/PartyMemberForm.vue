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
          {{ props.member ? `Edit ${props.member.name}` : "Add Hero" }}
        </h2>
        <button
          type="button"
          class="text-muted-foreground hover:text-foreground transition-colors text-xl leading-none"
          @click="emit('close')"
        >
          ×
        </button>
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
          :has-builder-data="hasBuilderData"
          :has-multiclass-data="hasMulticlassData"
          :multiclass-label="multiclassLabel"
          :multiclass-total="multiclassTotal"
          :member-id="memberId"
          :all-class-names="allClassNames"
          :subclass-options="subclassOptions"
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
        <button
          v-if="props.member"
          type="button"
          :disabled="saving"
          class="font-cinzel text-xs text-destructive hover:opacity-80 transition-opacity disabled:opacity-50"
          @click="remove"
        >
          Remove from party
        </button>
        <div class="flex gap-2 ml-auto">
          <button
            type="button"
            class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
            @click="emit('close')"
          >
            Cancel
          </button>
          <button
            type="button"
            :disabled="!form.name.trim() || saving"
            class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
            @click="save"
          >
            {{ props.member ? "Save Changes" : "Add to Party" }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { useConfirm } from "@/composables/useConfirm";
const { confirm } = useConfirm();
import { ref, reactive, computed, watch } from "vue";
import TabBar from "@/components/common/TabBar.vue";
import PartyMemberIdentityTab from "./PartyMemberIdentityTab.vue";
import PartyMemberAbilitiesTab from "./PartyMemberAbilitiesTab.vue";
import PartyMemberProficienciesTab from "./PartyMemberProficienciesTab.vue";
import PartyMemberPersonaTab from "./PartyMemberPersonaTab.vue";
import { useAllSpecies } from "@/composables/useSpecies";
import {
  useCreatePartyMember,
  useUpdatePartyMember,
  useDeletePartyMember,
} from "@/composables/useParty";
import {
  useCampaignMembers,
  useUpdateCampaignMember,
} from "@/composables/useCampaignMembers";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useCampaignStore } from "@/stores/campaign";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { formatMulticlassLabel, totalLevel } from "@/types/multiclass.types";
import type {
  PartyMember,
  PartyMemberInsert,
  SkillProficiencies,
  SpellSlotEntry,
} from "@/types/party.types";
import { getDefaultSpellSlots } from "@/types/spell.types";
import type { IdentityFormSlice, AbilitiesFormSlice, ProficienciesFormSlice, PersonaFormSlice } from "./partyMemberForm.types";

const TABS = [
  { id: "identity" as const, label: "Identity" },
  { id: "stats" as const, label: "Stats" },
  { id: "profs" as const, label: "Proficiencies" },
  { id: "persona" as const, label: "Persona" },
] as const;

type TabId = typeof TABS[number]["id"];

const props = defineProps<{ member: PartyMember | null }>();
const emit = defineEmits<{ close: [] }>();

// Multiclass / builder data
const memberId = computed(() => props.member?.id ?? null);
const { data: characterClassRows } = useCharacterClasses(memberId);
const hasMulticlassData = computed(() => (characterClassRows.value?.length ?? 0) > 0);
const multiclassLabel = computed(() => formatMulticlassLabel(characterClassRows.value ?? []));
const multiclassTotal = computed(() => totalLevel(characterClassRows.value ?? []));
const hasBuilderData = computed(() =>
  hasMulticlassData.value ||
  (props.member !== null && Object.keys(props.member.level_choices ?? {}).length > 0),
);

const campaignStore = useCampaignStore();
const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();

const allClassNames = computed<string[]>(() => {
  const disabledSet = new Set(campaignStore.activeCampaign?.disabled_class_names ?? []);
  const srd = (systemClasses.value ?? []).map(c => c.class_name).filter(n => !disabledSet.has(n));
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});

const { data: allSpecies } = useAllSpecies();
const speciesOptions = computed(() => {
  const campaignId = campaignStore.activeCampaignId;
  const disabledIds = new Set(campaignStore.activeCampaign?.disabled_species_ids ?? []);
  return (allSpecies.value ?? [])
    .filter((s) => {
      if (disabledIds.has(s.id)) return false;
      if (s.campaign_id !== null && s.campaign_id !== campaignId) return false;
      return true;
    })
    .map((s) => ({ id: s.id, name: s.name }));
});

const allSpeciesMap = computed<Record<string, string>>(() =>
  Object.fromEntries((allSpecies.value ?? []).map(s => [s.id, s.name])),
);

const selectedSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === form.species_id) ?? null);
const subraceOptions  = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

const selectedDisguiseSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === form.disguise_species_id) ?? null);
const disguiseSubraceOptions  = computed(() => selectedDisguiseSpecies.value?.subraces?.map(sr => sr.name) ?? []);

const { data: allCustomSubclasses } = useAllCustomSubclasses();
const subclassOptions = computed(() =>
  (allCustomSubclasses.value ?? [])
    .filter(sc => sc.class_name === form.class)
    .map(sc => sc.subclass_name),
);

const activeTab = ref<TabId>("identity");

// Portrait
const portraitUrl = ref(props.member?.portrait_url ?? "");
const focalPoint  = ref<{ x: number; y: number } | null>(props.member?.portrait_focal_point ?? null);

const form = reactive<
  Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "spell_slots"> & {
    sort_order: number;
  }
>({
  campaign_id: props.member?.campaign_id ?? null,
  name: props.member?.name ?? "",
  player_name: props.member?.player_name ?? "",
  class: props.member?.class ?? "",
  subclass: props.member?.subclass ?? "",
  level: props.member?.level ?? 1,
  subrace: props.member?.subrace ?? "",
  max_hp: props.member?.max_hp ?? 10,
  current_hp: props.member?.current_hp ?? 10,
  temp_hp: props.member?.temp_hp ?? 0,
  ac: props.member?.ac ?? 10,
  speed: props.member?.speed ?? 30,
  initiative_bonus: props.member?.initiative_bonus ?? 0,
  current_initiative: props.member?.current_initiative ?? null,
  str: props.member?.str ?? 10,
  dex: props.member?.dex ?? 10,
  con: props.member?.con ?? 10,
  int: props.member?.int ?? 10,
  wis: props.member?.wis ?? 10,
  cha: props.member?.cha ?? 10,
  proficiency_bonus: props.member?.proficiency_bonus ?? 2,
  skill_proficiencies: { ...props.member?.skill_proficiencies },
  saving_throw_proficiencies: [...(props.member?.saving_throw_proficiencies ?? [])],
  conditions: [...(props.member?.conditions ?? [])],
  inspiration: props.member?.inspiration ?? false,
  death_save_successes: props.member?.death_save_successes ?? 0,
  death_save_failures: props.member?.death_save_failures ?? 0,
  notes: props.member?.notes ?? "",
  sort_order: props.member?.sort_order ?? 0,
  curses: [...(props.member?.curses ?? [])],
  pp: props.member?.pp ?? 0,
  gp: props.member?.gp ?? 0,
  ep: props.member?.ep ?? 0,
  sp: props.member?.sp ?? 0,
  cp: props.member?.cp ?? 0,
  tool_proficiencies: [...(props.member?.tool_proficiencies ?? [])],
  languages: [...(props.member?.languages ?? [])],
  current_location_id: props.member?.current_location_id ?? null,
  carry_capacity_override: props.member?.carry_capacity_override ?? null,
  class_resources: props.member?.class_resources ?? {},
  class_choices: props.member?.class_choices ?? {},
  active_infusions: props.member?.active_infusions ?? [],
  rage_active: props.member?.rage_active ?? false,
  species_id: props.member?.species_id ?? null,
  disguise_species_id: props.member?.disguise_species_id ?? null,
  disguise_race: props.member?.disguise_race ?? null,
  disguise_subrace: props.member?.disguise_subrace ?? null,
  background_id: props.member?.background_id ?? null,
  height: props.member?.height ?? null,
  // Persona
  alignment:            props.member?.alignment            ?? "",
  deity:                props.member?.deity                ?? "",
  deity_id:             props.member?.deity_id             ?? null as string | null,
  age:                  props.member?.age                  ?? "",
  gender:               props.member?.gender               ?? "",
  pronouns:             props.member?.pronouns             ?? "",
  physical_description: props.member?.physical_description ?? "",
  personality_traits:   props.member?.personality_traits   ?? "",
  ideals:               props.member?.ideals               ?? "",
  bonds:                props.member?.bonds                ?? "",
  flaws:                props.member?.flaws                ?? "",
});

// Keep form.level in sync with authoritative total when multiclass data exists.
watch(multiclassTotal, (total) => {
  if (hasMulticlassData.value) form.level = total;
}, { immediate: true });

// --- Computed slices for each tab ---
const identitySlice = computed<IdentityFormSlice>(() => ({
  name: form.name,
  player_name: form.player_name ?? null,
  class: form.class ?? "",
  subclass: form.subclass ?? "",
  level: form.level,
  subrace: form.subrace ?? "",
  species_id: form.species_id,
  disguise_species_id: form.disguise_species_id,
  disguise_race: form.disguise_race,
  disguise_subrace: form.disguise_subrace,
  background_id: form.background_id,
  height: form.height ?? null,
  notes: form.notes ?? "",
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
  class: form.class ?? "",
  level: form.level,
}));

const proficienciesSlice = computed<ProficienciesFormSlice>(() => ({
  skill_proficiencies: form.skill_proficiencies as SkillProficiencies,
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
  alignment:            form.alignment            ?? "",
  deity:                form.deity                ?? "",
  deity_id:             form.deity_id             ?? null,
  age:                  form.age                  ?? "",
  gender:               form.gender               ?? "",
  pronouns:             form.pronouns             ?? "",
  physical_description: form.physical_description ?? "",
  personality_traits:   form.personality_traits   ?? "",
  ideals:               form.ideals               ?? "",
  bonds:                form.bonds                ?? "",
  flaws:                form.flaws                ?? "",
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
function buildSlotMaxes(
  existing: SpellSlotEntry[] | undefined,
  cls: string,
  level: number,
): number[] {
  if (existing && existing.length > 0) {
    return Array.from({ length: 9 }, (_, i) => existing.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const lvlIdx = Math.max(0, Math.min(19, Math.round(level) - 1));
  const dbClass =
    (customClasses.value ?? []).find(c => c.class_name === cls) ??
    (systemClasses.value ?? []).find(c => c.class_name === cls);
  if (dbClass?.spell_slots) {
    const row = dbClass.spell_slots[lvlIdx] ?? [];
    return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
  }
  const defaults = getDefaultSpellSlots(cls || null, level);
  return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
}

const spellSlotMaxes = reactive<number[]>(
  buildSlotMaxes(props.member?.spell_slots, props.member?.class ?? "", props.member?.level ?? 1),
);

function resetSlotsToDefault() {
  const defaults = buildSlotMaxes(undefined, form.class ?? "", form.level);
  defaults.forEach((v, i) => { spellSlotMaxes[i] = v; });
}

watch(() => form.class, () => {
  if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault();
});

// --- Proficiency bonus ---
const profBonus = computed(() => {
  const l = form.level;
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
    (m) => props.member && m.party_member_id === props.member.id,
  )?.id ?? "",
);

// --- CRUD ---
const { mutateAsync: create } = useCreatePartyMember();
const { mutateAsync: update } = useUpdatePartyMember();
const { mutateAsync: del } = useDeletePartyMember();

const saving = ref(false);

async function save() {
  if (saving.value) return;
  saving.value = true;
  const selectedPlayer = players.value.find((m) => m.id === selectedCampaignMemberId.value);
  const payload = {
    ...form,
    name: form.name.trim(),
    player_name: selectedPlayer?.display_name ?? (form.player_name || null),
    class: form.class || null,
    subclass: form.subclass || null,
    notes: form.notes || null,
    portrait_url: portraitUrl.value || null,
    portrait_focal_point: focalPoint.value,
    proficiency_bonus: profBonus.value,
    // Persona fields
    alignment:            form.alignment            || null,
    deity:                form.deity                || null,
    deity_id:             form.deity_id             || null,
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
        const existing = props.member?.spell_slots?.find((s: SpellSlotEntry) => s.level === i + 1);
        return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
      })
      .filter((s) => s.max > 0),
  };

  try {
    let partyMemberId = props.member?.id;
    if (props.member) {
      const { campaign_id: _cid, ...updatePayload } = payload;
      await update({ id: props.member.id, update: updatePayload });
    } else {
      const created = await create(payload);
      partyMemberId = created.id;
    }

    if (partyMemberId) {
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
    }

    emit("close");
  } finally {
    saving.value = false;
  }
}

async function remove() {
  if (!props.member) return;
  if (saving.value) return;
  if (!await confirm(`Remove ${props.member.name} from the party?`)) return;
  saving.value = true;
  try {
    await del(props.member);
    emit("close");
  } finally {
    saving.value = false;
  }
}
</script>
