<template>
  <!-- Lobby only: which players have rolled their own initiative. Players roll
       on their phones while the DM waits, so the runner has to say who is still
       out. The DM can still type or roll for anyone in the INIT field beside it. -->
  <span v-if="visible" class="roll-status" :class="rolled ? 'is-rolled' : 'is-waiting'">
    <span class="roll-chip">{{ rolled ? `Rolled ${combatant.initiative}` : "Waiting for roll" }}</span>
    <span v-if="playerName" class="roll-player">{{ playerName }}</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { liveState } from "@/composables/encounters/useEncounterLive";
import { useParty } from "@/composables/party/useParty";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant } = defineProps<{ combatant: RunCombatant }>();

const store = useEncounterRunStore();
const { data: party } = useParty();

// The lobby is round 0 of an encounter that is live: before going live nobody
// can roll, so "waiting" would be a claim about players who haven't been asked.
const lobbyOpen = computed(
  () =>
    store.round === 0 &&
    liveState.value?.is_running === true &&
    liveState.value.encounter_id === store.encounterId,
);

const visible = computed(
  () => lobbyOpen.value && combatant.type === "player" && !!combatant.party_member_id,
);
const rolled = computed(() => combatant.initiative !== null);
const playerName = computed(
  () => party.value?.find((m) => m.id === combatant.party_member_id)?.player_name ?? null,
);
</script>

<style scoped>
@reference "@/assets/main.css";

.roll-status {
  @apply inline-flex items-center gap-1.5 text-caption;
}
.roll-chip {
  @apply rounded px-1.5 py-0.5 font-semibold border;
}
.is-rolled .roll-chip { @apply bg-tone-success/10 text-ink-success border-tone-success/30; }
.is-waiting .roll-chip { @apply bg-tone-caution/10 text-ink-caution border-tone-caution/30; }
.roll-player { @apply text-muted-foreground; }
</style>
