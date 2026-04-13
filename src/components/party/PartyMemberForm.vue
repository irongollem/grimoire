<template>
  <!-- Modal backdrop -->
  <div class="fixed inset-0 z-50 flex items-start justify-end">
    <div class="absolute inset-0 bg-black/60" @click="emit('close')" />
    <div
      class="relative z-10 h-full w-full max-w-xl bg-background border-l border-border shadow-2xl flex flex-col overflow-hidden"
    >
      <!-- Header -->
      <div
        class="flex items-center justify-between px-5 py-4 border-b border-border shrink-0"
      >
        <h2 class="font-cinzel text-base font-bold text-foreground">
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
      <div class="flex border-b border-border shrink-0">
        <button
          v-for="tab in TABS"
          :key="tab.id"
          type="button"
          class="flex-1 px-3 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
          :class="
            activeTab === tab.id
              ? 'border-b-2 border-primary text-primary'
              : 'text-muted-foreground hover:text-foreground'
          "
          @click="activeTab = tab.id"
        >
          {{ tab.label }}
        </button>
      </div>

      <!-- Scrollable content -->
      <div class="flex-1 overflow-y-auto p-5 flex flex-col gap-4">
        <!-- Identity tab -->
        <template v-if="activeTab === 'identity'">
          <!-- Portrait + name -->
          <div class="flex gap-4">
            <div class="w-28 shrink-0">
              <ImageUpload
                :model-value="portraitUrl || null"
                :focal-point="focalPoint"
                show-focal-point
                @update:model-value="portraitUrl = $event ?? ''"
                @update:focal-point="focalPoint = $event"
              />
            </div>
            <div class="flex-1 flex flex-col gap-2">
              <label class="block">
                <span class="field-label">Character Name *</span>
                <input
                  v-model="f.name"
                  class="field-input w-full"
                  placeholder="Aric Stormblade"
                />
              </label>
              <label class="block">
                <span class="field-label">Player</span>
                <select
                  v-model="selectedCampaignMemberId"
                  class="field-input w-full"
                >
                  <option value="">— Unassigned —</option>
                  <option
                    v-for="p in players"
                    :key="p.id"
                    :value="p.id"
                  >
                    {{ p.display_name || p.user_id.slice(0, 8) }}
                  </option>
                </select>
                <p v-if="!players.length" class="font-fell text-xs text-muted-foreground/60 italic mt-1">
                  No players have joined yet — share an invite link first.
                </p>
              </label>
            </div>
          </div>
          <!-- Card Art (landscape, for MTG Card Forge) -->
          <div class="flex flex-col gap-1">
            <span class="field-label">Card Art
              <span class="font-fell normal-case font-normal italic text-muted-foreground">(landscape, for card printing)</span>
            </span>
            <ImageUpload
              :model-value="cardArtUrl || null"
              aspect="landscape"
              placeholder="Drop card art or click to upload"
              @update:model-value="cardArtUrl = $event ?? ''"
            />
          </div>

          <div class="grid grid-cols-2 gap-3">
            <div class="block">
              <span class="field-label">Species</span>
              <EntityCombobox
                :model-value="f.race ?? ''"
                :options="speciesOptions"
                placeholder="Select species…"
                @update:model-value="f.race = $event || null; f.subrace = ''"
              />
            </div>
            <div v-if="subraceOptions.length > 0" class="block">
              <span class="field-label">Variant</span>
              <select v-model="f.subrace" class="field-input w-full">
                <option value="">— None —</option>
                <option v-for="sr in subraceOptions" :key="sr" :value="sr">{{ sr }}</option>
              </select>
            </div>
            <label class="block">
              <span class="field-label">Class</span>
              <select v-model="f.class" class="field-input w-full">
                <option value="">— None —</option>
                <option v-for="c in allClassNames" :key="c" :value="c">{{ c }}</option>
              </select>
            </label>
            <div class="block">
              <span class="field-label">Subclass</span>
              <select v-if="subclassOptions.length > 0" v-model="f.subclass" class="field-input w-full">
                <option value="">— None —</option>
                <option v-for="sc in subclassOptions" :key="sc" :value="sc">{{ sc }}</option>
              </select>
              <input
                v-else
                v-model="f.subclass"
                class="field-input w-full"
                placeholder="Battle Master"
              />
            </div>
            <label class="block">
              <span class="field-label">Level</span>
              <input
                v-model.number="f.level"
                type="number"
                min="1"
                max="20"
                class="field-input w-full"
              />
            </label>
            <div>
              <label class="field-label">Proficiency Bonus</label>
              <div
                class="field-input bg-muted/30 text-muted-foreground flex items-center"
              >
                +{{ profBonus }}
                <span class="ml-2 text-[11px]">(from level {{ f.level }})</span>
              </div>
            </div>
          </div>
          <div>
            <span class="field-label">Notes</span>
            <RichTextEditor
              v-model="f.notes"
              placeholder="Background, personality, goals…"
              min-height="120px"
            />
          </div>
        </template>

        <!-- Stats tab -->
        <template v-if="activeTab === 'stats'">
          <!-- Ability scores -->
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase"
          >
            Ability Scores
          </p>
          <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
            <label
              v-for="stat in ABILITY_STATS"
              :key="stat.key"
              class="flex flex-col items-center gap-1"
            >
              <span
                class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider"
                >{{ stat.label }}</span
              >
              <input
                v-model.number="f[stat.key]"
                type="number"
                min="1"
                max="30"
                class="field-input w-full text-center px-1"
              />
              <span
                class="font-cinzel text-xs font-bold"
                :class="
                  mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'
                "
              >
                {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
              </span>
            </label>
          </div>

          <!-- Combat stats -->
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2"
          >
            Combat
          </p>
          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <label class="block">
              <span class="field-label">Max HP</span>
              <input
                v-model.number="f.max_hp"
                type="number"
                min="1"
                class="field-input w-full"
              />
            </label>
            <label class="block">
              <span class="field-label">Current HP</span>
              <input
                v-model.number="f.current_hp"
                type="number"
                class="field-input w-full"
              />
            </label>
            <label class="block">
              <span class="field-label">Temp HP</span>
              <input
                v-model.number="f.temp_hp"
                type="number"
                min="0"
                class="field-input w-full"
              />
            </label>
            <label class="block">
              <span class="field-label">Armor Class</span>
              <input
                v-model.number="f.ac"
                type="number"
                min="1"
                class="field-input w-full"
              />
            </label>
            <label class="block">
              <span class="field-label">Speed (ft)</span>
              <input
                v-model.number="f.speed"
                type="number"
                min="0"
                step="5"
                class="field-input w-full"
              />
            </label>
            <label class="block">
              <span class="field-label">Initiative Bonus</span>
              <input
                v-model.number="f.initiative_bonus"
                type="number"
                class="field-input w-full"
                placeholder="= DEX mod"
              />
            </label>
            <label class="block">
              <span class="field-label">Carry Capacity Override</span>
              <input
                v-model="f.carry_capacity_override"
                type="text"
                class="field-input w-full"
                placeholder="*2, +30, 150 — blank = STR×15"
              />
            </label>
          </div>

          <!-- Computed passives (read-only) -->
          <div
            class="rounded-lg bg-muted/30 border border-border p-3 grid grid-cols-3 gap-2 text-center"
          >
            <div>
              <p
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                PASSIVE PERC.
              </p>
              <p class="font-cinzel text-base font-bold text-foreground">
                {{ passivePerception }}
              </p>
            </div>
            <div>
              <p
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                PASSIVE INS.
              </p>
              <p class="font-cinzel text-base font-bold text-foreground">
                {{ passiveInsight }}
              </p>
            </div>
            <div>
              <p
                class="font-cinzel text-[10px] text-muted-foreground tracking-wider"
              >
                PASSIVE INV.
              </p>
              <p class="font-cinzel text-base font-bold text-foreground">
                {{ passiveInvestigation }}
              </p>
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
              @click="resetSlotsToDefault"
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
                v-model.number="spellSlotMaxes[lvl - 1]"
                type="number"
                min="0"
                max="9"
                class="field-input w-full text-center px-1"
              />
            </label>
          </div>
        </template>

        <!-- Proficiencies tab -->
        <template v-if="activeTab === 'profs'">
          <!-- Saving throws -->
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase"
          >
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
                :checked="f.saving_throw_proficiencies.includes(save.key)"
                class="rounded"
                @change="toggleSave(save.key)"
              />
              <span class="font-cinzel text-xs text-foreground">{{
                save.label
              }}</span>
              <span class="font-cinzel text-[10px] text-muted-foreground">
                {{ saveBonus(save.key) }}
              </span>
            </label>
          </div>

          <!-- Skills -->
          <p
            class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2"
          >
            Skills
          </p>
          <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
            <div
              v-for="skill in SKILLS"
              :key="skill.key"
              class="flex items-center gap-2"
            >
              <div
                class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0"
              >
                <button
                  v-for="level in PROF_LEVELS"
                  :key="level.value"
                  type="button"
                  class="px-1.5 py-0.5 transition-colors"
                  :class="
                    (f.skill_proficiencies[skill.key] ?? 'none') === level.value
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-card text-muted-foreground hover:text-foreground'
                  "
                  @click="setSkillProf(skill.key, level.value)"
                >
                  {{ level.label }}
                </button>
              </div>
              <span class="font-fell text-xs text-foreground flex-1">{{
                skill.label
              }}</span>
              <span
                class="font-cinzel text-[10px] text-muted-foreground shrink-0"
              >
                {{ skillBonus(skill.key, skill.ability) }}
              </span>
            </div>
          </div>

          <!-- Tool Proficiencies -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-4">
            Tool Proficiencies
          </p>
          <TagPickerInput
            :model-value="f.tool_proficiencies"
            :groups="TOOL_PROFICIENCY_GROUPS"
            placeholder="Search tools…"
            variant="primary"
            @update:model-value="f.tool_proficiencies = $event"
          />

          <!-- Languages -->
          <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">
            Languages
          </p>
          <TagPickerInput
            :model-value="f.languages"
            :groups="LANGUAGE_GROUPS"
            placeholder="Search languages…"
            @update:model-value="f.languages = $event"
          />
        </template>
      </div>

      <!-- Footer -->
      <div
        class="flex items-center justify-between gap-2 px-5 py-4 border-t border-border shrink-0"
      >
        <button
          v-if="props.member"
          type="button"
          class="font-cinzel text-xs text-destructive hover:opacity-80 transition-opacity"
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
            :disabled="!f.name.trim()"
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
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import EntityCombobox from "@/components/common/EntityCombobox.vue";
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
import { SKILLS } from "@/types/party.types";
import { useAllSystemClasses, useAllCustomClasses } from "@/composables/useCustomClasses";
import { useAllCustomSubclasses } from "@/composables/useCustomSubclasses";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import type {
  PartyMember,
  PartyMemberInsert,
  SkillProfLevel,
  SaveKey,
  SpellSlotEntry,
} from "@/types/party.types";
import { getDefaultSpellSlots } from "@/types/spell.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats", label: "Stats" },
  { id: "profs", label: "Proficiencies" },
] as const;

const ABILITY_STATS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];
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

const props = defineProps<{ member: PartyMember | null }>();
const emit = defineEmits<{ close: [] }>();

const { data: systemClasses } = useAllSystemClasses();
const { data: customClasses } = useAllCustomClasses();

const allClassNames = computed<string[]>(() => {
  const srd = (systemClasses.value ?? []).map(c => c.class_name);
  const custom = (customClasses.value ?? []).map(c => c.class_name);
  return [...new Set([...srd, ...custom])].sort();
});

const { data: allSpecies } = useAllSpecies();
const speciesOptions  = computed(() => (allSpecies.value ?? []).map(s => ({ id: s.id, name: s.name })));
const selectedSpecies = computed(() => (allSpecies.value ?? []).find(s => s.id === f.race) ?? null);
const subraceOptions  = computed(() => selectedSpecies.value?.subraces?.map(sr => sr.name) ?? []);

const { data: allCustomSubclasses } = useAllCustomSubclasses();
const subclassOptions = computed(() =>
  (allCustomSubclasses.value ?? [])
    .filter(sc => sc.class_name === f.class)
    .map(sc => sc.subclass_name),
);

const activeTab = ref<"identity" | "stats" | "profs">("identity");

// Portrait + card art
const portraitUrl = ref(props.member?.portrait_url ?? "");
const focalPoint  = ref<{ x: number; y: number } | null>(props.member?.portrait_focal_point ?? null);
const cardArtUrl  = ref(props.member?.card_art_url ?? "");

const f = reactive<
  Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "card_art_url" | "spell_slots"> & {
    sort_order: number;
  }
>({
  campaign_id: props.member?.campaign_id ?? null,
  name: props.member?.name ?? "",
  player_name: props.member?.player_name ?? "",
  class: props.member?.class ?? "",
  subclass: props.member?.subclass ?? "",
  level: props.member?.level ?? 1,
  race: props.member?.race ?? "",
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
  saving_throw_proficiencies: [
    ...(props.member?.saving_throw_proficiencies ?? []),
  ],
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
  species_id: props.member?.species_id ?? null,
  background: props.member?.background ?? null,
  background_id: props.member?.background_id ?? null,
});

// Spell slot max per level (index 0 = level 1, ..., index 8 = level 9)
function buildSlotMaxes(
  existing: SpellSlotEntry[] | undefined,
  cls: string,
  level: number,
): number[] {
  if (existing && existing.length > 0) {
    return Array.from({ length: 9 }, (_, i) => existing.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const lvlIdx = Math.max(0, Math.min(19, Math.round(level) - 1));
  // Check custom/system class slot grid first
  const dbClass =
    (customClasses.value ?? []).find(c => c.class_name === cls) ??
    (systemClasses.value ?? []).find(c => c.class_name === cls);
  if (dbClass?.spell_slots) {
    const row = dbClass.spell_slots[lvlIdx] ?? [];
    return Array.from({ length: 9 }, (_, i) => row[i] ?? 0);
  }
  // Fall back to SRD static table
  const defaults = getDefaultSpellSlots(cls || null, level);
  return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
}

const spellSlotMaxes = reactive<number[]>(
  buildSlotMaxes(props.member?.spell_slots, props.member?.class ?? "", props.member?.level ?? 1),
);

function resetSlotsToDefault() {
  const defaults = buildSlotMaxes(undefined, f.class ?? "", f.level);
  defaults.forEach((v, i) => { spellSlotMaxes[i] = v; });
}

// Auto-update slot defaults when class changes (only if all slots are currently 0)
watch(() => f.class, () => {
  if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault();
});

function mod(score: number) {
  return Math.floor((score - 10) / 2);
}

const profBonus = computed(() => {
  const l = f.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9) return 4;
  if (l >= 5) return 3;
  return 2;
});

function skillProf(key: keyof typeof f.skill_proficiencies) {
  return f.skill_proficiencies[key] ?? "none";
}

function setSkillProf(
  key: keyof typeof f.skill_proficiencies,
  val: SkillProfLevel,
) {
  f.skill_proficiencies[key] = val;
}
function skillBonus(
  key: keyof typeof f.skill_proficiencies,
  ability: SaveKey,
): string {
  const base = mod(f[ability]);
  const prof = skillProf(key);
  const bonus =
    prof === "proficient"
      ? base + profBonus.value
      : prof === "expertise"
        ? base + profBonus.value * 2
        : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}
function toggleSave(key: SaveKey) {
  const idx = f.saving_throw_proficiencies.indexOf(key);
  if (idx >= 0) f.saving_throw_proficiencies.splice(idx, 1);
  else f.saving_throw_proficiencies.push(key);
}
function saveBonus(key: SaveKey): string {
  const base = mod(f[key]);
  const bonus = f.saving_throw_proficiencies.includes(key)
    ? base + profBonus.value
    : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}

// Passive skills
const passivePerception = computed(() => {
  const base = mod(f.wis);
  const prof = skillProf("perception");
  return (
    10 +
    base +
    (prof === "proficient"
      ? profBonus.value
      : prof === "expertise"
        ? profBonus.value * 2
        : 0)
  );
});
const passiveInsight = computed(() => {
  const base = mod(f.wis);
  const prof = skillProf("insight");
  return (
    10 +
    base +
    (prof === "proficient"
      ? profBonus.value
      : prof === "expertise"
        ? profBonus.value * 2
        : 0)
  );
});
const passiveInvestigation = computed(() => {
  const base = mod(f.int);
  const prof = skillProf("investigation");
  return (
    10 +
    base +
    (prof === "proficient"
      ? profBonus.value
      : prof === "expertise"
        ? profBonus.value * 2
        : 0)
  );
});

// Campaign members (for player assignment dropdown)
const { data: campaignMembers } = useCampaignMembers();
const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

const players = computed(() =>
  (campaignMembers.value ?? []).filter((m) => m.role === "player"),
);

// Which campaign member is currently assigned to this party member
const selectedCampaignMemberId = ref<string>(
  (campaignMembers.value ?? []).find(
    (m) => props.member && m.party_member_id === props.member.id,
  )?.id ?? "",
);

// CRUD
const { mutateAsync: create } = useCreatePartyMember();
const { mutateAsync: update } = useUpdatePartyMember();
const { mutateAsync: del } = useDeletePartyMember();

async function save() {
  // Derive player_name from selected campaign member
  const selectedPlayer = players.value.find((m) => m.id === selectedCampaignMemberId.value);
  const payload = {
    ...f,
    name: f.name.trim(),
    player_name: selectedPlayer?.display_name ?? (f.player_name || null),
    class: f.class || null,
    subclass: f.subclass || null,
    race: f.race || null,
    notes: f.notes || null,
    portrait_url: portraitUrl.value || null,
    portrait_focal_point: focalPoint.value,
    card_art_url: cardArtUrl.value || null,
    proficiency_bonus: profBonus.value,
    spell_slots: spellSlotMaxes
      .map((max, i) => {
        const existing = props.member?.spell_slots?.find((s: SpellSlotEntry) => s.level === i + 1);
        return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
      })
      .filter((s) => s.max > 0),
  };

  let partyMemberId = props.member?.id;
  if (props.member) {
    // Exclude campaign_id: never overwrite it on update.
    const { campaign_id: _cid, ...updatePayload } = payload;
    await update({ id: props.member.id, update: updatePayload });
  } else {
    const created = await create(payload);
    partyMemberId = created.id;
  }

  // Sync campaign_members assignment
  if (partyMemberId) {
    // Un-assign any player currently pointing at this party member (except the selected one)
    for (const m of players.value) {
      if (m.party_member_id === partyMemberId && m.id !== selectedCampaignMemberId.value) {
        await updateCampaignMember({ id: m.id, update: { party_member_id: null } });
      }
    }
    // Assign selected player
    if (selectedCampaignMemberId.value) {
      await updateCampaignMember({
        id: selectedCampaignMemberId.value,
        update: { party_member_id: partyMemberId },
      });
    }
  }

  emit("close");
}

async function remove() {
  if (!props.member) return;
  if (!await confirm(`Remove ${props.member.name} from the party?`)) return;
  await del(props.member);
  emit("close");
}
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
