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
        :rounded="false"
        @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
        @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
      />
      <p v-if="npc.stat_block.senses" class="detail-line"><span>Senses</span>{{ npc.stat_block.senses }}</p>
      <p v-if="npc.stat_block.languages" class="detail-line"><span>Languages</span>{{ npc.stat_block.languages }}</p>
      <p v-if="npc.stat_block.damage_resistances" class="detail-line"><span>Resistances</span>{{ npc.stat_block.damage_resistances }}</p>
      <p v-if="npc.stat_block.damage_immunities" class="detail-line"><span>Immunities</span>{{ npc.stat_block.damage_immunities }}</p>
      <p v-if="npc.stat_block.condition_immunities" class="detail-line"><span>Cond. Immune</span>{{ npc.stat_block.condition_immunities }}</p>
      <RunnerTraitSection
        :sections="traitSections"
        @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
        @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
      />
      <template v-if="npc.stat_block?.spellcasting?.entries?.length">
        <div class="detail-divider" />
        <SpellcastingList :spellcasting="npc.stat_block.spellcasting" />
      </template>
    </template>
    <p v-else class="font-fell text-xs text-muted-foreground italic px-1 pt-2">No stat block defined for this NPC.</p>
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import SpellcastingList from "@/components/common/SpellcastingList.vue";
import RunnerTraitSection from "@/components/encounters/RunnerTraitSection.vue";
import type { Npc } from "@/types/npc.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, npc } = defineProps<{
  combatant: RunCombatant;
  npc: Npc;
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
}>();

const traitSections = computed(() => {
  const sb = npc.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions",           traits: sb.actions },
    { label: "Legendary Actions", traits: sb.legendary_actions },
  ].filter((s) => s.traits?.length);
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
  @apply font-fell text-xs text-muted-foreground italic capitalize;
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
  @apply font-cinzel text-[0.5625rem] tracking-wider text-muted-foreground uppercase;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}

.detail-line {
  @apply font-fell text-xs text-foreground;
}

.detail-line span {
  @apply font-cinzel text-[0.5625rem] font-bold tracking-wider text-muted-foreground uppercase mr-1;
}
</style>
