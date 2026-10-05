<template>
  <div class="space-y-3">
    <PlayerRollModeControl :conditions="member.conditions ?? []" :shown="CHECK_TARGETS" />

    <!-- Passives -->
    <div class="rounded-lg border border-border bg-card px-4 py-2.5 flex flex-wrap gap-x-6 gap-y-1">
      <span class="text-label text-muted-foreground">
        Passive Perception <span class="text-foreground font-bold">{{ passivePerception }}</span>
      </span>
      <span class="text-label text-muted-foreground">
        Passive Insight <span class="text-foreground font-bold">{{ passiveInsight }}</span>
      </span>
      <span class="text-label text-muted-foreground">
        Passive Investigation <span class="text-foreground font-bold">{{ passiveInvestigation }}</span>
      </span>
    </div>

    <SkillRollList
      :member="member"
      :check-disadvantage="checkDisadvantage"
      :check-penalty="checkPenalty"
      :override-scores="overrideScores"
      @roll="emit('roll', $event)"
    />
  </div>
</template>

<script setup lang="ts">
import { computed } from "vue";
import PlayerRollModeControl from "@/components/player/PlayerRollModeControl.vue";
import SkillRollList from "@/components/player/SkillRollList.vue";
import type { DisadvantageTarget } from "@/rules/rollModeNotes";
import { passiveScore } from "@/rules/skillCheck";
import type { PartyMember, SkillProficiencies } from "@/types/party.types";

const props = defineProps<{
  member: PartyMember;
  checkDisadvantage: boolean;
  /** 2024-only flat Exhaustion penalty to every ability check (0 under 2014, see `checkDisadvantage`). */
  checkPenalty: number;
  /** Beast ability scores override STR/DEX/CON when wildshaped */
  overrideScores?: { str: number; dex: number; con: number; int: number; wis: number; cha: number };
}>();
const emit = defineEmits<{ roll: [result: { label: string; dice: number; modifier: number; total: number; masked?: boolean }] }>();

/** What this tab rolls, so the roll mode control names only the conditions that matter here. */
const CHECK_TARGETS = ["ability checks"] as const satisfies readonly DisadvantageTarget[];

function passiveFor(skillKey: keyof SkillProficiencies) {
  return passiveScore(props.member, skillKey, props.overrideScores);
}
const passivePerception   = computed(() => passiveFor("perception"));
const passiveInsight      = computed(() => passiveFor("insight"));
const passiveInvestigation = computed(() => passiveFor("investigation"));
</script>
