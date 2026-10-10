<template>
  <div class="detail-scroll">
    <FocalImage
      v-if="portrait.src"
      :src="portrait.src"
      :alt="portrait.alt"
      :focal-point="portrait.focalPoint"
      format="portrait"
      class="detail-portrait"
    />
    <p class="detail-meta">
      {{ [npc.race, npc.occupation].filter(Boolean).join(' · ') }}
      <span v-if="npc.alignment"> · {{ npc.alignment }}</span>
    </p>
    <template v-if="npc.stat_block">
      <div class="detail-divider" />
      <div class="detail-stats">
        <div class="detail-stat"><span>AC</span><strong>{{ npc.stat_block.armor_class }}</strong></div>
        <div class="detail-stat"><span>HP</span><strong>{{ npc.stat_block.hit_points }}</strong></div>
        <div class="detail-stat" v-if="npc.stat_block.speed"><span>Speed</span><strong>{{ npc.stat_block.speed }}</strong></div>
        <div class="detail-stat" v-if="npc.stat_block.challenge_rating"><span>CR</span><strong>{{ npc.stat_block.challenge_rating }}</strong></div>
      </div>
      <div class="detail-divider" />
      <AbilityScoreTable
        :scores="{
          str: npc.stat_block.str ?? 10,
          dex: npc.stat_block.dex ?? 10,
          con: npc.stat_block.con ?? 10,
          int: npc.stat_block.int ?? 10,
          wis: npc.stat_block.wis ?? 10,
          cha: npc.stat_block.cha ?? 10,
        }"
        @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
        @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
      />
      <p v-if="npc.stat_block.senses" class="detail-line"><span>Senses</span>{{ npc.stat_block.senses }}</p>
      <p v-if="npc.stat_block.languages" class="detail-line"><span>Languages</span>{{ npc.stat_block.languages }}</p>
      <p v-if="npc.stat_block.defenses.resistances.length" class="detail-line"><span>Resistances</span>{{ formatDefenseList(npc.stat_block.defenses.resistances) }}</p>
      <p v-if="npc.stat_block.defenses.vulnerabilities.length" class="detail-line"><span>Vulnerabilities</span>{{ formatDefenseList(npc.stat_block.defenses.vulnerabilities) }}</p>
      <p v-if="npc.stat_block.defenses.immunities.length" class="detail-line"><span>Immunities</span>{{ formatDefenseList(npc.stat_block.defenses.immunities) }}</p>
      <p v-if="npc.stat_block.defenses.condition_immunities.length" class="detail-line"><span>Cond. Immune</span>{{ formatConditionImmunities(npc.stat_block.defenses.condition_immunities) }}</p>
      <RunnerActionList :combatant="combatant" :sections="actionSections" />
      <template v-if="npc.stat_block?.spellcasting?.entries?.length">
        <div class="detail-divider" />
        <SpellcastingList :spellcasting="npc.stat_block.spellcasting" />
      </template>
    </template>
    <p v-else class="text-caption text-muted-foreground italic px-1 pt-2">No stat block defined for this NPC.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import { formPortrait } from "@/lib/wildshapePortrait";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import RunnerActionList from "@/components/encounters/RunnerActionList.vue";
import { formatConditionImmunities, formatDefenseList } from "@/rules/statBlock/parseDefenses";
import type { NpcListRow } from "@/types/npc.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, npc } = defineProps<{
  combatant: RunCombatant;
  npc: NpcListRow;
}>();

const portrait = computed(() => formPortrait(combatant, combatant.wildshape));

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
}>();

const actionSections = computed(() => {
  const sb = npc.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", entries: sb.special_abilities },
    { label: "Actions", entries: sb.actions },
    { label: "Legendary Actions", entries: sb.legendary_actions },
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
  @apply text-heading-sm font-bold text-foreground;
}

.detail-line {
  @apply text-caption text-foreground;
}

.detail-line span {
  @apply text-eyebrow font-bold text-muted-foreground mr-1;
}
</style>
