<template>
  <!-- Desktop: fixed-column grid with a shared header row -->
  <template v-if="!isMobile">
    <div class="combatant-header">
      <span></span>
      <span>INIT</span>
      <span>NAME</span>
      <span>HP</span>
      <span>AC</span>
      <span>CONDITIONS</span>
    </div>
    <RunnerCombatantRow
      v-for="combatant in store.sortedCombatants"
      :key="combatant.instance_id"
      :combatant="combatant"
      :selected-id="selectedId"
      @select="emit('select', $event)"
    />
  </template>

  <!-- Mobile: stacked card per combatant -->
  <template v-else>
    <RunnerCombatantCard
      v-for="combatant in store.sortedCombatants"
      :key="combatant.instance_id"
      :combatant="combatant"
      :selected-id="selectedId"
      @select="emit('select', $event)"
    />
  </template>

  <p v-if="!store.sortedCombatants.length" class="empty-runner">
    No combatants. Go back to the builder to add monsters and party members.
  </p>
</template>

<script setup lang="ts">
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useIsMobile } from "@/composables/useBreakpoint";
import RunnerCombatantRow from "@/components/encounters/RunnerCombatantRow.vue";
import RunnerCombatantCard from "@/components/encounters/RunnerCombatantCard.vue";

defineProps<{ selectedId: string | null }>();
const emit = defineEmits<{ select: [id: string | null] }>();

const isMobile = useIsMobile();
const store = useEncounterRunStore();
</script>

<style scoped>
@reference "@/assets/main.css";

.combatant-header {
  display: grid;
  grid-template-columns: 2.5rem 3.5rem 1fr 10rem 3rem 1fr;
  gap: 0.5rem;
  @apply pr-3 py-1.5 text-label text-muted-foreground border-b border-border bg-muted/30 items-center;
}

.combatant-header span:nth-child(2),
.combatant-header span:nth-child(4),
.combatant-header span:nth-child(5) {
  @apply text-center;
}

.empty-runner {
  @apply text-center text-body text-muted-foreground italic py-16;
}
</style>
