<template>
  <div class="detail-scroll">
    <FocalImage
      v-if="combatant.wildshape?.beast_image_url ?? combatant.portrait_url"
      :src="(combatant.wildshape?.beast_image_url ?? combatant.portrait_url)!"
      :alt="combatant.name"
      :focal-point="combatant.wildshape?.beast_image_url ? null : (combatant.portrait_focal_point ?? null)"
      format="portrait"
      class="detail-portrait"
    />
    <p class="detail-meta">
      {{ [speciesNameMap.get(member.species_id ?? '') ?? null, member.class].filter(Boolean).join(' · ') }}
      <span v-if="member.level"> · Level {{ member.level }}</span>
    </p>
    <div class="detail-divider" />
    <div class="detail-stats">
      <div class="detail-stat"><span>AC</span><strong>{{ acFor(member) }}</strong></div>
      <div class="detail-stat">
        <span>HP</span>
        <strong>
          {{ member.current_hp }}/{{ member.max_hp }}
          <span v-if="member.temp_hp > 0" class="text-blue-400">+{{ member.temp_hp }}</span>
        </strong>
      </div>
      <div class="detail-stat"><span>Speed</span><strong>{{ member.speed }} ft.</strong></div>
      <div class="detail-stat"><span>Prof</span><strong>+{{ profBonus }}</strong></div>
    </div>
    <div class="detail-divider" />
    <AbilityScoreTable
      :scores="playerScores"
      :saves="playerSaves"
      :rounded="false"
      @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
      @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
    />
    <!-- Skills -->
    <div class="detail-divider" />
    <p class="detail-section-label">Skills</p>
    <div class="detail-check-grid">
      <button
        v-for="sk in SKILLS"
        :key="sk.key"
        type="button"
        class="detail-check-btn"
        :class="{ 'check-proficient': skillProf(sk.key) !== 'none', 'check-expertise': skillProf(sk.key) === 'expertise' }"
        @click="emit('roll-check', skillBonus(sk.key, sk.ability), sk.label)"
      >
        <span>{{ sk.label }}</span>
        <em>{{ skillBonus(sk.key, sk.ability) >= 0 ? '+' : '' }}{{ skillBonus(sk.key, sk.ability) }}</em>
      </button>
    </div>

    <!-- Attacks (melee + ranged + ammo) -->
    <RunnerPcAttacks
      :member="member"
      :prof-bonus="profBonus"
      :ability-mod="abilityMod"
      @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
      @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
    />

    <!-- Curses -->
    <RunnerPcConditions
      :curses="combatant.curses"
      @remove-curse="(curse) => store.removeCurse(combatant.instance_id, curse)"
      @add-curse="(curse) => store.addCurse(combatant.instance_id, curse)"
    />

    <!-- Wildshape -->
    <RunnerPcWildshape
      v-if="isDruid || combatant.wildshape"
      :combatant="combatant"
      :member="member"
      :monsters="monsters"
      @roll-check="(mod, label) => emit('roll-check', mod, label)"
      @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
      @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
      @revert-wildshape="store.revertWildshape(combatant.instance_id)"
      @enter-wildshape="handleWildshape"
    />

    <template v-if="member.notes">
      <div class="detail-divider" />
      <p class="detail-notes">{{ member.notes }}</p>
    </template>

    <!-- Prepared / Known Spells -->
    <RunnerPcSpells
      v-if="preparedOrKnownSpells.length"
      :member="member"
      :spells="preparedOrKnownSpells"
      :caster-type="casterType"
      :spell-save-dc="spellSaveDc"
      :spell-attack-bonus="spellAttackBonus"
      :spellcasting-by-class="spellcastingByClass"
      @roll-spell="(spell) => emit('roll-spell', spell)"
      @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
      @roll-spell-save="(spell, dc) => emit('roll-spell-save', spell, dc)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { hitPointsToMax } from "@/lib/dice";
import FocalImage from "@/components/common/FocalImage.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RunnerPcAttacks from "@/components/encounters/RunnerPcAttacks.vue";
import RunnerPcConditions from "@/components/encounters/RunnerPcConditions.vue";
import RunnerPcWildshape from "@/components/encounters/RunnerPcWildshape.vue";
import RunnerPcSpells from "@/components/encounters/RunnerPcSpells.vue";
import type { PartyMember, SaveKey } from "@/types/party.types";
import { SKILLS } from "@/types/party.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { Monster } from "@/types/monster.types";
import type { Spell } from "@/types/spell.types";
import { getCasterType } from "@/types/spell.types";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useSpeciesNameMap } from "@/composables/useSpecies";
import { useCharacterSpellsWithDetails } from "@/composables/useCharacterSpells";
import { useAllCustomClasses, useAllSystemClasses, useClassByName } from "@/composables/useCustomClasses";
import { useCharacterClasses } from "@/composables/useCharacterClasses";
import { useShieldAcBonus } from "@/composables/useShieldAc";
import { useRuleset } from "@/composables/useRuleset";
import { getSpellPreparationPolicy } from "@/lib/spellPreparationPolicy";
import { pickSpellcastingStats } from "@/types/multiclass.types";
import { computeSpellcastingByClass } from "@/lib/spellcastingByClass";

const { combatant, member, monsters } = defineProps<{
  combatant: RunCombatant;
  member: PartyMember;
  monsters: Monster[];
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
  "roll-spell": [spell: Spell];
  "roll-spell-save": [spell: Spell, dc: number];
}>();

// ── Stores & composables ──────────────────────────────────────────────────────

const store = useEncounterRunStore();
const speciesNameMap = useSpeciesNameMap();
const { acFor } = useShieldAcBonus();
const { ruleset } = useRuleset();

const memberId = computed(() => member.id);

const classRef = computed(() => member.class ?? "");
const classData = useClassByName(classRef);
const casterType = computed(() =>
  getSpellPreparationPolicy(member.class ?? "", ruleset.value)?.casterType
    ?? classData.value?.caster_type
    ?? getCasterType(member.class ?? null),
);

const { data: playerSpells } = useCharacterSpellsWithDetails(memberId);
const { data: characterClasses } = useCharacterClasses(memberId);
const { data: allSystemClasses } = useAllSystemClasses();
const { data: allCustomClasses } = useAllCustomClasses();

const spellcastingByClass = computed(() => computeSpellcastingByClass(
  member,
  characterClasses.value ?? [],
  { system: allSystemClasses.value ?? [], custom: allCustomClasses.value ?? [] },
  ruleset.value,
));

// ── Proficiency bonus ─────────────────────────────────────────────────────────

const profBonus = computed(() => {
  if (member.proficiency_bonus) return member.proficiency_bonus;
  const l = member.level;
  if (l >= 17) return 6;
  if (l >= 13) return 5;
  if (l >= 9)  return 4;
  if (l >= 5)  return 3;
  return 2;
});

// ── Ability helpers ───────────────────────────────────────────────────────────

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

const ABILITY_KEYS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

const playerScores = computed(() => ({
  str: member.str ?? 10, dex: member.dex ?? 10, con: member.con ?? 10,
  int: member.int ?? 10, wis: member.wis ?? 10, cha: member.cha ?? 10,
}));

function saveBonus(key: SaveKey): number {
  const base = abilityMod(member[key]);
  const profs: string[] = member.saving_throw_proficiencies ?? [];
  return profs.includes(key) ? base + profBonus.value : base;
}

const playerSaves = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() =>
  Object.fromEntries(
    ABILITY_KEYS.map((s) => [
      s.key,
      { bonus: saveBonus(s.key as SaveKey), proficient: (member.saving_throw_proficiencies ?? []).includes(s.key) },
    ]),
  ),
);

function skillProf(key: string) {
  return member.skill_proficiencies?.[key as keyof typeof member.skill_proficiencies] ?? "none";
}

function skillBonus(key: string, ability: SaveKey): number {
  const base = abilityMod(member[ability]);
  const prof = skillProf(key);
  if (prof === "expertise")  return base + profBonus.value * 2;
  if (prof === "proficient") return base + profBonus.value;
  return base;
}

// ── Spells ────────────────────────────────────────────────────────────────────

const preparedOrKnownSpells = computed(() => {
  const entries = playerSpells.value ?? [];
  return entries.filter((entry) => {
    if (entry.source_type !== "class") return true;
    const sourceCaster = pickSpellcastingStats(spellcastingByClass.value, entry.source_class_id)?.casterType
      ?? casterType.value;
    if (sourceCaster === "none") return false;
    return sourceCaster === "known" || entry.is_prepared || entry.spell.level === 0;
  });
});

const spellSaveDc = computed(() => {
  const cls = member.class ?? "";
  let spellMod: number;
  if (["Cleric", "Druid", "Ranger"].includes(cls))                                              spellMod = abilityMod(member.wis);
  else if (["Wizard", "Fighter (Eldritch Knight)", "Rogue (Arcane Trickster)"].includes(cls))   spellMod = abilityMod(member.int);
  else                                                                                           spellMod = abilityMod(member.cha);
  return 8 + profBonus.value + spellMod;
});

// Spell attack bonus = proficiency + spellcasting modifier = save DC − 8.
const spellAttackBonus = computed(() => spellSaveDc.value - 8);

// ── Wildshape handler (store mutation lives here) ─────────────────────────────

const isDruid = computed(() =>
  (member.class as string | null)?.toLowerCase().includes("druid") ?? false,
);

function handleWildshape(monster: Monster) {
  const sb = monster.stat_block;
  const maxHp = hitPointsToMax(sb?.hit_points, 1);
  const ac = String(sb?.armor_class ?? "10");
  const wildshapesUsed = (member.wildshapes_used ?? 0) + 1;
  store.enterWildshape(combatant.instance_id, {
    id: monster.id,
    name: monster.name,
    image_url: monster.image_url ?? null,
    max_hp: maxHp,
    ac,
  }, wildshapesUsed);
}
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-scroll {
  @apply flex-1 overflow-y-auto p-3 flex flex-col gap-2;
}

.detail-portrait {
  @apply w-full rounded-md object-cover mb-1 overflow-hidden;
  max-height: 12.5rem;
}

.detail-meta {
  @apply text-caption text-muted-foreground italic capitalize;
}

.detail-divider {
  @apply border-t border-border/60 my-1;
}

.detail-stats {
  @apply grid grid-cols-2 gap-1;
}

.detail-stat {
  @apply flex flex-col bg-muted/40 rounded px-2 py-1;
}

.detail-stat span {
  @apply text-eyebrow text-muted-foreground;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-check-grid {
  @apply grid grid-cols-2 gap-1;
}

.detail-check-btn {
  @apply flex items-center justify-between bg-muted/30 rounded px-2 py-1 hover:bg-primary/10 hover:border-primary/30 border border-transparent transition-colors cursor-pointer;
}

.detail-check-btn span {
  @apply text-eyebrow text-muted-foreground truncate;
}

.detail-check-btn em {
  @apply font-cinzel text-xs font-bold not-italic text-foreground shrink-0 ml-1;
}

.check-proficient {
  @apply border-l-2 border-l-primary/60;
}

.check-expertise {
  @apply border-l-2 border-l-amber-500/80;
}

.detail-section-label {
  @apply text-eyebrow font-bold text-muted-foreground mt-1;
}

.detail-notes {
  @apply text-caption text-muted-foreground italic;
}
</style>
