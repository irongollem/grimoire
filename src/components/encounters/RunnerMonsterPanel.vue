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
      :rounded="false"
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
    <p v-if="monster.stat_block?.damage_resistances" class="detail-line"><span>Resistances</span>{{ monster.stat_block.damage_resistances }}</p>
    <p v-if="monster.stat_block?.damage_immunities" class="detail-line"><span>Immunities</span>{{ monster.stat_block.damage_immunities }}</p>
    <p v-if="monster.stat_block?.condition_immunities" class="detail-line"><span>Cond. Immune</span>{{ monster.stat_block.condition_immunities }}</p>
    <RunnerTraitSection
      :sections="traitSections"
      @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
      @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
    />
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
import FocalImage from "@/components/common/FocalImage.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import RunnerTraitSection from "@/components/encounters/RunnerTraitSection.vue";
import RunnerLegendaryActions from "@/components/encounters/RunnerLegendaryActions.vue";
import type { Monster } from "@/types/monster.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, monster } = defineProps<{
  combatant: RunCombatant;
  monster: Monster;
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
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

function parseSaveString(s: string): Record<string, number> {
  const result: Record<string, number> = {};
  for (const part of s.split(",")) {
    const m = part.trim().match(/^(\w+)\s+([+-]\d+)$/);
    if (m) result[m[1].toLowerCase()] = Number(m[2]);
  }
  return result;
}

const monsterScores = computed(() => {
  const sb = monster.stat_block;
  return {
    str: sb?.str ?? 10, dex: sb?.dex ?? 10, con: sb?.con ?? 10,
    int: sb?.int ?? 10, wis: sb?.wis ?? 10, cha: sb?.cha ?? 10,
  };
});

const monsterSaves = computed<Record<string, import("@/components/common/AbilityScoreTable.vue").SaveEntry>>(() => {
  const sb = monster.stat_block;
  const parsed = sb?.saving_throws ? parseSaveString(sb.saving_throws) : {};
  return Object.fromEntries(
    ABILITY_KEYS.map((s) => {
      const base = abilityMod(sb?.[s.key] ?? 10);
      return [s.key, { bonus: parsed[s.key] ?? base, proficient: s.key in parsed }];
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

const traitSections = computed(() => {
  const sb = monster.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions", traits: sb.actions },
    { label: "Bonus Actions", traits: sb.bonus_actions },
    { label: "Reactions", traits: sb.reactions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
    { label: "Lair Actions", traits: sb.lair_actions },
  ];
});
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
