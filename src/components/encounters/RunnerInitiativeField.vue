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
      :aria-label="`Initiative for ${combatant.name}`"
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
  </span>
</template>

<script setup lang="ts">
import { IconDiceRoll } from "@/lib/icons";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

defineProps<{ combatant: RunCombatant }>();

const store = useEncounterRunStore();
</script>

<style scoped>
@reference "@/assets/main.css";

.init-field {
  @apply inline-flex items-center gap-1;
}

.init-input {
  @apply w-10 text-center bg-muted border border-border rounded px-1 py-0.5 font-cinzel text-sm font-bold text-foreground focus:outline-none focus:ring-1 focus:ring-ring;
}

.init-roll-btn {
  @apply flex items-center justify-center shrink-0 rounded border border-border bg-muted/60 p-0.5 text-muted-foreground transition-colors hover:text-foreground hover:border-foreground/30 disabled:opacity-40 disabled:cursor-not-allowed;
}
</style>
