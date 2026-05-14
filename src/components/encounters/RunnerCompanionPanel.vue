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
        :rounded="false"
        @roll-ability="(_, label, mod) => emit('roll-check', mod, label + ' Check')"
        @roll-save="(_, label, bonus) => emit('roll-check', bonus, label + ' Save')"
      />
    </template>
    <RunnerTraitSection
      :sections="traitSections"
      @roll-attack="(bonus, name) => emit('roll-attack', bonus, name)"
      @roll-damage="(desc, name) => emit('roll-damage', desc, name)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import FocalImage from "@/components/common/FocalImage.vue";
import AbilityScoreTable from "@/components/common/AbilityScoreTable.vue";
import RunnerTraitSection from "@/components/encounters/RunnerTraitSection.vue";
import type { Companion } from "@/types/companion.types";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant, companion } = defineProps<{
  combatant: RunCombatant;
  companion: Companion;
}>();

const emit = defineEmits<{
  "roll-check": [modifier: number, label: string];
  "roll-attack": [bonus: number, name: string];
  "roll-damage": [desc: string, name: string];
}>();

const traitSections = computed(() => {
  const sb = companion.stat_block;
  if (!sb) return [];
  return [
    { label: "Special Abilities", traits: sb.special_abilities },
    { label: "Actions",           traits: sb.actions },
    { label: "Bonus Actions",     traits: sb.bonus_actions },
    { label: "Reactions",         traits: sb.reactions },
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
  max-height: 200px;
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
  @apply font-cinzel text-[9px] tracking-wider text-muted-foreground uppercase;
}

.detail-stat strong {
  @apply font-cinzel text-sm font-bold text-foreground;
}
</style>
