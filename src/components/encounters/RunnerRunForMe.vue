<template>
  <section v-if="takeTurn" class="run-for-me mb-2" aria-label="Run this turn for me">
    <AppButton
      variant="outline"
      size="sm"
      label="Run this turn for me"
      :loading="busy"
      :disabled="blocked !== null"
      @click="takeTurn.run(combatant.instance_id)"
    />
    <p v-if="blocked" class="mt-1 text-caption text-muted-foreground">{{ blocked }}</p>
    <p v-if="error" class="mt-1 text-caption text-destructive" role="alert">{{ error }}</p>
    <div v-if="result?.turn" class="mt-2" aria-live="polite">
      <p class="text-body font-semibold">{{ result.turn.summary }}</p>
      <p class="text-caption text-muted-foreground">{{ result.turn.reason }}</p>
      <p v-if="result.turn.ruledOutByNote?.length" class="text-caption text-muted-foreground">
        Its note ruled out: {{ result.turn.ruledOutByNote.map((o) => o.summary).join("; ") }}
      </p>
      <p v-if="result.turn.leftTheMap" class="text-caption text-muted-foreground">It left the map and is out of the fight.</p>
      <p v-if="result.turn.bareMap" class="text-caption text-muted-foreground">
        Nothing is drawn on this map, so it crossed it as open ground. Trace the walls and paint difficult-terrain zones, and creatures will keep to them.
      </p>
      <ul v-if="lines.length > 0" class="mt-1 space-y-0.5">
        <li v-for="(line, i) in lines" :key="i" class="text-caption">{{ line }}</li>
      </ul>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed, inject } from "vue";
import AppButton from "@/components/common/controls/AppButton.vue";
import { RUNNER_TAKE_TURN } from "@/components/encounters/runnerResolve";
import { describeResolvedAction } from "@/lib/encounters/resolvedLine";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";

/**
 * "Run this turn for me" (#1203): asks the server to play this creature's turn and shows what it did and why. It never
 * ends the turn. Renders nothing outside the runner, which is what provides the request.
 */
const { combatant } = defineProps<{ combatant: RunCombatant }>();

const takeTurn = inject(RUNNER_TAKE_TURN, null);
const store = useEncounterRunStore();

const busy = computed(() => takeTurn?.pending[combatant.instance_id] === true);
const error = computed(() => takeTurn?.errors[combatant.instance_id]);
const result = computed(() => takeTurn?.results[combatant.instance_id]);

// The server refuses both, so they are never sent.
const blocked = computed(() => {
  if (combatant.hp <= 0) return `${combatant.name} is down.`;
  if (combatant.action_used === true) return `${combatant.name} has used its Action this turn.`;
  return null;
});

/** A creature that fled the map is gone from the list, so a name falls back to nothing it could mislabel. */
const lines = computed(() => {
  const names = new Map(store.combatants.map((c) => [c.instance_id, c.name]));
  names.set(combatant.instance_id, combatant.name);
  return (result.value?.outcomes ?? []).map((o) => describeResolvedAction(o, (id) => names.get(id) ?? "Someone"));
});
</script>
