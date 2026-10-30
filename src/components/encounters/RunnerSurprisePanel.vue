<template>
  <!-- Pre-combat: Mark surprised combatants -->
  <div
    v-if="!store.started && hasAnyCombatants"
    class="rounded-lg border border-dashed border-tone-caution/40 bg-tone-caution/5 px-3 py-2 mb-2"
  >
    <div class="flex items-center justify-between gap-2">
      <span class="text-label-lg font-semibold text-ink-caution">
        SURPRISE · Optional
      </span>
      <AppButton
        variant="ghost"
        size="inline-xs"
        :label="showSurprise ? 'Hide' : 'Mark surprised'"
        @click="showSurprise = !showSurprise"
      />
    </div>
    <p v-if="!showSurprise && surprisedCount === 0" class="text-caption text-muted-foreground italic mt-0.5">
      Mark creatures that are surprised; they'll skip their first turn.
    </p>
    <div v-else-if="showSurprise" class="mt-2 flex flex-wrap gap-1.5">
      <AppButton
        v-for="c in store.combatants"
        :key="c.instance_id"
        variant="subtle"
        surface="card"
        tone="caution"
        size="xs"
        :active="c.surprised"
        @click="store.toggleSurprised(c.instance_id)"
      >{{ c.name }}{{ c.surprised ? ' ✦' : '' }}</AppButton>
    </div>
    <p v-if="!showSurprise && surprisedCount > 0" class="text-caption text-ink-caution mt-0.5">
      {{ surprisedCount }} surprised creature{{ surprisedCount > 1 ? 's' : '' }}.
    </p>
  </div>
</template>

<script setup lang="ts">
/**
 * The pre-combat Surprise strip. Desktop draws it above the list; a phone keeps
 * it in the combat tools sheet, so the list gets the screen.
 */
import { ref, computed } from "vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import AppButton from "@/components/common/controls/AppButton.vue";

const store = useEncounterRunStore();

const showSurprise = ref(false);
const surprisedCount = computed(() => store.combatants.filter((c) => c.surprised).length);
const hasAnyCombatants = computed(() => store.combatants.length > 0);
</script>
