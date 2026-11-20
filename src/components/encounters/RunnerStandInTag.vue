<template>
  <!-- Same words as the solo roster's allies (SoloFightRoster): the AI plays this character's turn when autopilot is on. -->
  <span v-if="isStandIn" class="text-caption text-muted-foreground" data-testid="stand-in-tag">acts on their own</span>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import { RUNNER_STAND_INS } from "@/components/encounters/runnerResolve";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant } = defineProps<{ combatant: RunCombatant }>();
const standIns = inject(RUNNER_STAND_INS, null);
const isStandIn = computed(() => combatant.type === "player" && combatant.party_member_id !== undefined && standIns !== null && standIns.value.has(combatant.party_member_id));
</script>
