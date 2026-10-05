<template>
  <!-- Initiative entry + a per-combatant roll button, shared by the desktop row
       and the mobile card. The roll button only exists while the encounter is
       still being prepped — once combat starts the order is locked and a stray
       re-roll would shuffle the turn everyone is standing in. -->
  <span class="init-field">
    <input
      type="number"
      :value="combatant.initiative ?? ''"
      placeholder="—"
      class="init-input"
      :class="{ 'is-tied': tied }"
      :title="tied ? tieHint : undefined"
      :aria-label="tied ? `Initiative for ${combatant.name}, tied` : `Initiative for ${combatant.name}`"
      @change="(e) => store.setInitiative(combatant.instance_id, Number((e.target as HTMLInputElement).value))"
    />
    <button
      v-if="!store.started"
      type="button"
      class="init-roll-btn"
      :disabled="store.rollingInitiative"
      :title="combatant.initiative === null
        ? `Roll initiative for ${combatant.name}`
        : `Re-roll initiative for ${combatant.name}`"
      @click.stop="store.rollInitiative(combatant.instance_id)"
    >
      <IconDiceRoll class="h-3 w-3" />
    </button>
    <span v-if="tied" class="init-tie" :title="tieHint" aria-hidden="true">tie</span>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { IconDiceRoll } from "@/lib/icons";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

const { combatant } = defineProps<{ combatant: RunCombatant }>();

const store = useEncounterRunStore();

// Equal totals are ordered by Dexterity (higher first), then as the list already
// stands. Marking them tells the DM where that call was made, and editing either
// value is how they overrule it: monsters are the DM's to order, and players
// settle theirs among themselves.
const tied = computed(() => store.tiedInstanceIds.has(combatant.instance_id));
const tieHint = "Tied. Higher Dexterity goes first. Change a value to reorder.";
</script>

<style scoped>
@reference "@/assets/main.css";

.init-field {
  @apply inline-flex flex-wrap items-center justify-center gap-x-1;
}

.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 text-heading-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.init-input.is-tied {
  @apply border-tone-caution/60;
}

.init-tie {
  @apply basis-full text-center text-caption leading-none text-ink-caution font-semibold;
}

.init-roll-btn {
  @apply flex items-center justify-center shrink-0 rounded border border-border bg-muted/60 p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
