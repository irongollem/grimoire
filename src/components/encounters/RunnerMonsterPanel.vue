<template>
  <div class="detail-scroll">
    <RunnerPortrait
      :src="combatant.wildshape?.beast_image_url ?? combatant.portrait_url"
      :alt="combatant.name"
      :focal-point="combatant.wildshape?.beast_image_url ? null : (combatant.portrait_focal_point ?? null)"
    />
    <p class="detail-meta">
      {{ monster.size }} {{ monster.monster_type
      }}<span v-if="monster.alignment"> · {{ monster.alignment }}</span>
    </p>
    <div class="detail-divider" />
    <div class="detail-stats">
      <div class="detail-stat"><span>AC</span><strong>{{ monster.stat_block?.armor_class }}</strong></div>
      <div class="detail-stat"><span>HP</span><strong>{{ monster.stat_block?.hit_points }}</strong></div>
      <div class="detail-stat"><span>Speed</span><strong>{{ monster.stat_block?.speed }}</strong></div>
      <div class="detail-stat"><span>CR</span><strong>{{ monster.stat_block?.challenge_rating }}</strong></div>
    </div>
    <div class="detail-divider" />
    <AbilityScoreTable
      :scores="monsterScores"
      :saves="monsterSaves"
      @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
      @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
    />
    <!-- Monster skills -->
    <template v-if="skillEntries.length">
      <div class="detail-divider" />
      <p class="detail-section-label">Skills</p>
      <div class="detail-check-grid">
        <button
          v-for="sk in skillEntries"
          :key="sk.label"
          type="button"
          class="detail-check-btn"
          @click="emit('roll-check', sk.bonus, sk.label)"
        >
          <span>{{ sk.label }}</span>
          <em>{{ sk.bonus >= 0 ? '+' : '' }}{{ sk.bonus }}</em>
        </button>
      </div>
    </template>
    <template v-if="monster.stat_block?.senses">
      <div class="detail-divider" />
      <p class="detail-line"><span>Senses</span>{{ monster.stat_block.senses }}</p>
    </template>
    <p v-if="monster.stat_block?.languages" class="detail-line"><span>Languages</span>{{ monster.stat_block.languages }}</p>
    <template v-if="monster.stat_block">
      <p v-if="monster.stat_block.defenses.resistances.length" class="detail-line"><span>Resistances</span>{{ formatDefenseList(monster.stat_block.defenses.resistances) }}</p>
      <p v-if="monster.stat_block.defenses.vulnerabilities.length" class="detail-line"><span>Vulnerabilities</span>{{ formatDefenseList(monster.stat_block.defenses.vulnerabilities) }}</p>
      <p v-if="monster.stat_block.defenses.immunities.length" class="detail-line"><span>Immunities</span>{{ formatDefenseList(monster.stat_block.defenses.immunities) }}</p>
      <p v-if="monster.stat_block.defenses.condition_immunities.length" class="detail-line"><span>Cond. Immune</span>{{ formatConditionImmunities(monster.stat_block.defenses.condition_immunities) }}</p>
    </template>
    <RunnerActionList :combatant="combatant" :sections="actionSections" />
    <template v-if="monster.stat_block?.spellcasting?.entries?.length">
      <div class="detail-divider" />
      <SpellcastingList :spellcasting="monster.stat_block.spellcasting" />
    </template>
    <!-- Legendary action tracker -->
    <template v-if="combatant.legendary_action_cap">
      <div class="detail-divider" />
      <RunnerLegendaryActions
        :cap="combatant.legendary_action_cap"
        :remaining="combatant.legendary_actions_remaining ?? 0"
        @spend="emit('spend-legendary', $event)"
      />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RunnerPortrait from "@/components/encounters/RunnerPortrait.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import type { SaveEntry } from "@/rules/characterChecks";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import RunnerActionList from "@/components/encounters/RunnerActionList.vue";
import { listedSaveBonus, saveBonusFromStatBlock } from "@/rules/combat/savingThrow";
import { formatConditionImmunities, formatDefenseList } from "@/rules/statBlock/parseDefenses";
import RunnerLegendaryActions from "@/components/encounters/RunnerLegendaryActions.vue";
import type { Monster } from "@/types/monster.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, monster } = defineProps<{
  combatant: RunCombatant;
  monster: Monster;
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "spend-legendary": [count: number];
}>();

const ABILITY_KEYS = [
  { key: "str" as const, label: "STR" },
  { key: "dex" as const, label: "DEX" },
  { key: "con" as const, label: "CON" },
  { key: "int" as const, label: "INT" },
  { key: "wis" as const, label: "WIS" },
  { key: "cha" as const, label: "CHA" },
];

function abilityMod(score: number): number {
  return Math.floor((score - 10) / 2);
}

const monsterScores = computed(() => {
  const sb = monster.stat_block;
  return {
    str: sb?.str ?? 10, dex: sb?.dex ?? 10, con: sb?.con ?? 10,
    int: sb?.int ?? 10, wis: sb?.wis ?? 10, cha: sb?.cha ?? 10,
  };
});

const monsterSaves = computed<Record<string, SaveEntry>>(() => {
  const sb = monster.stat_block;
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => {
      const base = abilityMod(sb?.[s.key] ?? 10);
      const bonus = sb ? saveBonusFromStatBlock(sb, s.key) : base;
      // Proficient means the stat block prints this save, whatever its number.
      return [s.key, { bonus, proficient: sb ? listedSaveBonus(sb, s.key) !== null : false }];
    }),
  );
});

const skillEntries = computed(() => {
  const sb = monster.stat_block;
  if (!sb?.skills) return [];
  return Object.entries(sb.skills).map(([key, val]) => ({
    label: key.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase()),
    bonus: Number(val),
  }));
});

const actionSections = computed(() => {
  const sb = monster.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", list: "special_abilities" as const, entries: sb.special_abilities },
    { label: "Actions", list: "actions" as const, entries: sb.actions },
    { label: "Bonus Actions", list: "bonus_actions" as const, entries: sb.bonus_actions },
    { label: "Reactions", list: "reactions" as const, entries: sb.reactions },
    { label: "Legendary Actions", list: "legendary_actions" as const, entries: sb.legendary_actions },
    { label: "Lair Actions", list: "lair_actions" as const, entries: sb.lair_actions },
  ];
});
</script>

<style scoped>
@reference "@/assets/main.css";

.detail-scroll {
  @apply flex-1 overflow-y-auto p-3 flex flex-col gap-2;
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
  @apply text-heading-sm font-bold text-foreground;
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
  @apply text-label-lg font-bold not-italic text-foreground shrink-0 ml-1;
}

.detail-section-label {
  @apply text-eyebrow font-bold text-muted-foreground mt-1;
}

.detail-line {
  @apply text-caption text-foreground;
}

.detail-line span {
  @apply text-eyebrow font-bold text-muted-foreground mr-1;
}
</style>
