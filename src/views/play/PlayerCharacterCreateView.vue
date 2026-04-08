<template>
  <div class="max-w-2xl mx-auto space-y-6 pb-8">
    <div>
      <h1 class="font-cinzel text-xl font-bold text-foreground">
        {{ isEditMode ? `Edit ${existingMember?.name ?? "Character"}` : "Create Your Character" }}
      </h1>
      <p class="font-fell text-sm text-muted-foreground italic mt-1">
        {{ isEditMode ? "Update your hero's details below." : "Fill in your hero's details below." }}
      </p>
    </div>

    <!-- Tabs -->
    <div class="flex border-b border-border">
      <button
        v-for="tab in TABS"
        :key="tab.id"
        type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold tracking-wider transition-colors"
        :class="activeTab === tab.id
          ? 'border-b-2 border-primary text-primary'
          : 'text-muted-foreground hover:text-foreground'"
        @click="activeTab = tab.id"
      >
        {{ tab.label }}
      </button>
    </div>

    <!-- Identity tab -->
    <div v-if="activeTab === 'identity'" class="space-y-4">
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
            <span class="field-label">Player Name</span>
            <input
              v-model="f.player_name"
              class="field-input w-full"
              :placeholder="auth.membership?.display_name ?? 'Your name'"
            />
          </label>
        </div>
      </div>

      <!-- Card Art -->
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
        <label class="block">
          <span class="field-label">Race</span>
          <input v-model="f.race" class="field-input w-full" placeholder="Human" />
        </label>
        <label class="block">
          <span class="field-label">Class</span>
          <select v-model="f.class" class="field-input w-full">
            <option value="">— None —</option>
            <option v-for="c in PARTY_CLASSES" :key="c" :value="c">{{ c }}</option>
          </select>
        </label>
        <label class="block">
          <span class="field-label">Subclass</span>
          <input v-model="f.subclass" class="field-input w-full" placeholder="Battle Master" />
        </label>
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
          <div class="field-input bg-muted/30 text-muted-foreground flex items-center">
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
    </div>

    <!-- Stats tab -->
    <div v-if="activeTab === 'stats'" class="space-y-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">
        Ability Scores
      </p>
      <div class="grid grid-cols-3 sm:grid-cols-6 gap-2">
        <label v-for="stat in ABILITY_STATS" :key="stat.key" class="flex flex-col items-center gap-1">
          <span class="font-cinzel text-[10px] font-semibold text-muted-foreground tracking-wider">{{ stat.label }}</span>
          <input
            v-model.number="f[stat.key]"
            type="number"
            min="1"
            max="30"
            class="field-input w-full text-center px-1"
          />
          <span
            class="font-cinzel text-xs font-bold"
            :class="mod(f[stat.key]) >= 0 ? 'text-green-500' : 'text-destructive'"
          >
            {{ mod(f[stat.key]) >= 0 ? "+" : "" }}{{ mod(f[stat.key]) }}
          </span>
        </label>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">
        Combat
      </p>
      <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <label class="block">
          <span class="field-label">Max HP</span>
          <input v-model.number="f.max_hp" type="number" min="1" class="field-input w-full" />
        </label>
        <label class="block">
          <span class="field-label">Current HP</span>
          <input v-model.number="f.current_hp" type="number" class="field-input w-full" />
        </label>
        <label class="block">
          <span class="field-label">Temp HP</span>
          <input v-model.number="f.temp_hp" type="number" min="0" class="field-input w-full" />
        </label>
        <label class="block">
          <span class="field-label">Armor Class</span>
          <input v-model.number="f.ac" type="number" min="1" class="field-input w-full" />
        </label>
        <label class="block">
          <span class="field-label">Speed (ft)</span>
          <input v-model.number="f.speed" type="number" min="0" step="5" class="field-input w-full" />
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

      <!-- Computed passives -->
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

      <!-- Spell Slots -->
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
        <label v-for="lvl in 9" :key="lvl" class="flex flex-col items-center gap-1">
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
    </div>

    <!-- Proficiencies tab -->
    <div v-if="activeTab === 'profs'" class="space-y-4">
      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase">
        Saving Throw Proficiencies
      </p>
      <div class="grid grid-cols-3 gap-2">
        <label v-for="save in SAVE_STATS" :key="save.key" class="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            :checked="f.saving_throw_proficiencies.includes(save.key)"
            class="rounded"
            @change="toggleSave(save.key)"
          />
          <span class="font-cinzel text-xs text-foreground">{{ save.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground">{{ saveBonus(save.key) }}</span>
        </label>
      </div>

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-2">
        Skills
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
        <div v-for="skill in SKILLS" :key="skill.key" class="flex items-center gap-2">
          <div class="flex rounded overflow-hidden border border-border text-[10px] font-cinzel font-semibold shrink-0">
            <button
              v-for="level in PROF_LEVELS"
              :key="level.value"
              type="button"
              class="px-1.5 py-0.5 transition-colors"
              :class="(f.skill_proficiencies[skill.key] ?? 'none') === level.value
                ? 'bg-primary text-primary-foreground'
                : 'bg-card text-muted-foreground hover:text-foreground'"
              @click="setSkillProf(skill.key, level.value)"
            >
              {{ level.label }}
            </button>
          </div>
          <span class="font-fell text-xs text-foreground flex-1">{{ skill.label }}</span>
          <span class="font-cinzel text-[10px] text-muted-foreground shrink-0">
            {{ skillBonus(skill.key, skill.ability) }}
          </span>
        </div>
      </div>

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

      <p class="font-cinzel text-xs font-semibold text-muted-foreground tracking-wider uppercase mt-3">
        Languages
      </p>
      <TagPickerInput
        :model-value="f.languages"
        :groups="LANGUAGE_GROUPS"
        placeholder="Search languages…"
        @update:model-value="f.languages = $event"
      />
    </div>

    <!-- Footer actions -->
    <div class="flex items-center justify-end gap-3 pt-2 border-t border-border">
      <button
        type="button"
        class="px-4 py-2 font-cinzel text-xs font-semibold text-muted-foreground border border-border rounded-md hover:text-foreground transition-colors"
        @click="router.push('/play')"
      >
        Cancel
      </button>
      <button
        type="button"
        :disabled="!f.name.trim() || saving"
        class="px-4 py-2 font-cinzel text-xs font-semibold bg-primary text-primary-foreground rounded-md hover:opacity-90 transition-opacity disabled:opacity-50"
        @click="save"
      >
        {{ saving ? (isEditMode ? "Saving…" : "Creating…") : (isEditMode ? "Save Changes" : "Create Character") }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, reactive, computed, watch } from "vue";
import { useRouter, useRoute } from "vue-router";
import { useAuthStore } from "@/stores/auth";
import { useParty, useCreatePartyMember, useUpdatePartyMember } from "@/composables/useParty";
import { useCampaignMembers, useUpdateCampaignMember } from "@/composables/useCampaignMembers";
import { SKILLS, PARTY_CLASSES } from "@/types/party.types";
import { TOOL_PROFICIENCY_GROUPS, LANGUAGE_GROUPS } from "@/lib/proficiency-lists";
import { getDefaultSpellSlots } from "@/types/spell.types";
import RichTextEditor from "@/components/common/RichTextEditor.vue";
import ImageUpload from "@/components/common/ImageUpload.vue";
import TagPickerInput from "@/components/common/TagPickerInput.vue";
import type { PartyMemberInsert, SkillProfLevel, SaveKey, SpellSlotEntry } from "@/types/party.types";

const SLOT_LEVEL_LABELS = ["1st", "2nd", "3rd", "4th", "5th", "6th", "7th", "8th", "9th"] as const;

const TABS = [
  { id: "identity", label: "Identity" },
  { id: "stats",    label: "Stats" },
  { id: "profs",    label: "Proficiencies" },
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
  { value: "none",       label: "–" },
  { value: "proficient", label: "P" },
  { value: "expertise",  label: "E" },
];

const router = useRouter();
const route  = useRoute();
const auth   = useAuthStore();

const isEditMode = computed(() => route.name === "play-character-edit");

const { data: partyMembers }    = useParty();
const { data: campaignMembers } = useCampaignMembers();
const { mutateAsync: create }              = useCreatePartyMember();
const { mutateAsync: update }              = useUpdatePartyMember();
const { mutateAsync: updateCampaignMember } = useUpdateCampaignMember();

// The player's currently linked party member (used in edit mode)
const existingMember = computed(() =>
  auth.linkedPartyMemberId && partyMembers.value
    ? (partyMembers.value.find((m) => m.id === auth.linkedPartyMemberId) ?? null)
    : null,
);

const activeTab = ref<"identity" | "stats" | "profs">("identity");
const saving    = ref(false);

// Portrait + card art — seeded from existing member in edit mode
const portraitUrl = ref(existingMember.value?.portrait_url ?? "");
const focalPoint  = ref<{ x: number; y: number } | null>(existingMember.value?.portrait_focal_point ?? null);
const cardArtUrl  = ref(existingMember.value?.card_art_url ?? "");

const m = existingMember.value;
const f = reactive<
  Omit<PartyMemberInsert, "sort_order" | "portrait_url" | "card_art_url" | "spell_slots"> & {
    sort_order: number;
  }
>({
  campaign_id: m?.campaign_id ?? null,
  name:        m?.name ?? "",
  player_name: m?.player_name ?? auth.membership?.display_name ?? "",
  class:       m?.class ?? "",
  subclass:    m?.subclass ?? "",
  level:       m?.level ?? 1,
  race:        m?.race ?? "",
  max_hp:      m?.max_hp ?? 10,
  current_hp:  m?.current_hp ?? 10,
  temp_hp:     m?.temp_hp ?? 0,
  ac:          m?.ac ?? 10,
  speed:       m?.speed ?? 30,
  initiative_bonus:   m?.initiative_bonus ?? 0,
  current_initiative: m?.current_initiative ?? null,
  str: m?.str ?? 10,
  dex: m?.dex ?? 10,
  con: m?.con ?? 10,
  int: m?.int ?? 10,
  wis: m?.wis ?? 10,
  cha: m?.cha ?? 10,
  proficiency_bonus:           m?.proficiency_bonus ?? 2,
  skill_proficiencies:         { ...(m?.skill_proficiencies ?? {}) },
  saving_throw_proficiencies:  [...(m?.saving_throw_proficiencies ?? [])],
  conditions:   [...(m?.conditions ?? [])],
  inspiration:  m?.inspiration ?? false,
  death_save_successes: m?.death_save_successes ?? 0,
  death_save_failures:  m?.death_save_failures ?? 0,
  notes:    m?.notes ?? "",
  sort_order: m?.sort_order ?? 0,
  curses:   [...(m?.curses ?? [])],
  pp: m?.pp ?? 0,
  gp: m?.gp ?? 0,
  ep: m?.ep ?? 0,
  sp: m?.sp ?? 0,
  cp: m?.cp ?? 0,
  tool_proficiencies:  [...(m?.tool_proficiencies ?? [])],
  languages:           [...(m?.languages ?? [])],
  current_location_id: m?.current_location_id ?? null,
  carry_capacity_override: m?.carry_capacity_override ?? null,
  class_resources: m?.class_resources ?? {},
  class_choices: m?.class_choices ?? {},
});

// Spell slot maxes (index 0 = level 1)
function buildSlotMaxes(): number[] {
  if (m?.spell_slots?.length) {
    return Array.from({ length: 9 }, (_, i) => m.spell_slots!.find((s) => s.level === i + 1)?.max ?? 0);
  }
  const defaults = getDefaultSpellSlots(m?.class ?? null, m?.level ?? 1);
  return Array.from({ length: 9 }, (_, i) => defaults.find((s) => s.level === i + 1)?.max ?? 0);
}

const spellSlotMaxes = reactive<number[]>(buildSlotMaxes());

function resetSlotsToDefault() {
  const defaults = getDefaultSpellSlots(f.class || null, f.level);
  Array.from({ length: 9 }, (_, i) => {
    spellSlotMaxes[i] = defaults.find((s) => s.level === i + 1)?.max ?? 0;
  });
}

watch(() => f.class, () => {
  if (spellSlotMaxes.every((v) => v === 0)) resetSlotsToDefault();
});

function mod(score: number) { return Math.floor((score - 10) / 2); }

const profBonus = computed(() => {
  const l = f.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9)  return 4;
  if (l >= 5)  return 3;
  return 2;
});

function skillProf(key: keyof typeof f.skill_proficiencies) {
  return f.skill_proficiencies[key] ?? "none";
}
function setSkillProf(key: keyof typeof f.skill_proficiencies, val: SkillProfLevel) {
  f.skill_proficiencies[key] = val;
}
function skillBonus(key: keyof typeof f.skill_proficiencies, ability: SaveKey): string {
  const base = mod(f[ability]);
  const prof = skillProf(key);
  const bonus = prof === "proficient"
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
  const bonus = f.saving_throw_proficiencies.includes(key) ? base + profBonus.value : base;
  return (bonus >= 0 ? "+" : "") + bonus;
}

// Passive skills
const passivePerception = computed(() => {
  const base = mod(f.wis);
  const prof = skillProf("perception");
  return 10 + base + (prof === "proficient" ? profBonus.value : prof === "expertise" ? profBonus.value * 2 : 0);
});
const passiveInsight = computed(() => {
  const base = mod(f.wis);
  const prof = skillProf("insight");
  return 10 + base + (prof === "proficient" ? profBonus.value : prof === "expertise" ? profBonus.value * 2 : 0);
});
const passiveInvestigation = computed(() => {
  const base = mod(f.int);
  const prof = skillProf("investigation");
  return 10 + base + (prof === "proficient" ? profBonus.value : prof === "expertise" ? profBonus.value * 2 : 0);
});

async function save() {
  if (!f.name.trim() || saving.value) return;
  saving.value = true;

  const spellSlots: SpellSlotEntry[] = spellSlotMaxes
    .map((max, i) => {
      const existing = existingMember.value?.spell_slots?.find((s) => s.level === i + 1);
      return { level: i + 1, max, used: max > 0 ? (existing?.used ?? 0) : 0 };
    })
    .filter((s) => s.max > 0);

  const payload = {
    ...f,
    name:        f.name.trim(),
    player_name: f.player_name || auth.membership?.display_name || null,
    class:       f.class || null,
    subclass:    f.subclass || null,
    race:        f.race || null,
    notes:       f.notes || null,
    portrait_url:        portraitUrl.value || null,
    portrait_focal_point: focalPoint.value,
    card_art_url:         cardArtUrl.value || null,
    proficiency_bonus:    profBonus.value,
    spell_slots:          spellSlots,
  };

  if (isEditMode.value && existingMember.value) {
    const { campaign_id: _cid, ...updatePayload } = payload;
    await update({ id: existingMember.value.id, update: updatePayload });
  } else {
    const created = await create(payload);
    // Link the new character to the current player's campaign_members row
    const myMembership = (campaignMembers.value ?? []).find((cm) => cm.user_id === auth.user?.id);
    if (myMembership) {
      await updateCampaignMember({ id: myMembership.id, update: { party_member_id: created.id } });
    }
    await auth.refreshMembership();
  }

  saving.value = false;
  router.push("/play");
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
