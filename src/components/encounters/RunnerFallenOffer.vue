<template>
  <div class="fallen-offer" role="group" :aria-label="`${combatant.name} has failed three death saves`" data-testid="fallen-offer">
    <div class="min-w-0 flex-1">
      <p class="text-body font-semibold text-foreground">{{ combatant.name }} has failed three death saves.</p>
      <p class="text-caption italic text-muted-foreground">Nothing is recorded until you choose. A revivify has a minute.</p>
    </div>
    <div class="flex shrink-0 items-center gap-2">
      <AppButton variant="ghost" size="sm" label="Not yet" data-testid="offer-dismiss" @click="emit('dismiss')" />
      <AppButton variant="primary" size="sm" label="Mark as fallen…" data-testid="offer-mark" @click="emit('mark')" />
    </div>
  </div>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * The encounter runner's offer under a party member who has failed three death saves
 * (Hall of the Fallen, #982, frame 07). It records nothing by itself: three failures never
 * mark anyone fallen, because revivify, resurrection and a merciful DM all exist. "Not yet"
 * is the caller's to remember for the run; "Mark as fallen…" opens the dialog.
 */
defineProps<{ combatant: RunCombatant }>();
const emit = defineEmits<{ dismiss: []; mark: [] }>();
</script>

<style scoped>
.fallen-offer {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.5rem 1rem;
  padding: 0.5rem 0.75rem;
  border-bottom: 1px solid var(--color-border);
  border-left: 0.25rem solid #6e1f1a;
  background: color-mix(in srgb, #6e1f1a 10%, transparent);
}
</style>
