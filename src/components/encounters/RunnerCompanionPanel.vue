<template>
  <div class="detail-scroll">
    <RunnerPortrait :src="portrait.src" :alt="portrait.alt" :focal-point="portrait.focalPoint" />
    <p class="detail-meta capitalize">{{ companion.companion_type?.replace('_', ' ') }}</p>
    <div class="detail-divider" />
    <div class="detail-stats">
      <div class="detail-stat"><span>AC</span><strong>{{ combatant.ac }}</strong></div>
      <div class="detail-stat"><span>HP</span><strong>{{ combatant.hp }}/{{ combatant.max_hp }}</strong></div>
      <div class="detail-stat" v-if="companion.stat_block?.speed"><span>Speed</span><strong>{{ companion.stat_block.speed }}</strong></div>
    </div>
    <template v-if="companion.stat_block">
      <div class="detail-divider" />
      <AbilityScoreTable
        :scores="{
          str: companion.stat_block.str ?? 10,
          dex: companion.stat_block.dex ?? 10,
          con: companion.stat_block.con ?? 10,
          int: companion.stat_block.int ?? 10,
          wis: companion.stat_block.wis ?? 10,
          cha: companion.stat_block.cha ?? 10,
        }"
        @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
        @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
      />
    </template>
    <RunnerActionList :combatant="combatant" :sections="actionSections" />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import RunnerPortrait from "@/components/encounters/RunnerPortrait.vue";
import { formPortrait } from "@/lib/wildshapePortrait";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RunnerActionList from "@/components/encounters/RunnerActionList.vue";
import type { Companion } from "@/types/companion.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, companion } = defineProps<{
  combatant: RunCombatant;
  companion: Companion;
}>();

const portrait = computed(() => formPortrait(combatant, combatant.wildshape));

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
}>();

const actionSections = computed(() => {
  const sb = companion.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", list: "special_abilities" as const, entries: sb.special_abilities },
    { label: "Actions", list: "actions" as const, entries: sb.actions },
    { label: "Bonus Actions", list: "bonus_actions" as const, entries: sb.bonus_actions },
    { label: "Reactions", list: "reactions" as const, entries: sb.reactions },
    { label: "Legendary Actions", list: "legendary_actions" as const, entries: sb.legendary_actions },
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
</style>
