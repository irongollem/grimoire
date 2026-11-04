<template>
  <ol class="flex min-h-0 flex-1 flex-col gap-0.5 overflow-y-auto p-2" aria-label="Initiative order">
    <li v-for="c in store.sortedCombatants" :key="c.instance_id">
      <AppButton
        variant="ghost"
        size="well"
        block
        class="relative"
        :active="c.instance_id === selectedId"
        :aria-current="isTurn(c) ? 'true' : undefined"
        :data-turn="isTurn(c) ? 'true' : undefined"
        @click="emit('select', c.instance_id)"
      >
        <!-- The bookmark edge marks whose turn it is. -->
        <span v-if="isTurn(c)" class="absolute inset-y-1 left-0 w-1 rounded-r bg-primary" aria-hidden="true"></span>
        <span class="flex w-full items-center gap-2">
          <span class="w-6 shrink-0 text-right font-mono text-label text-muted-foreground">{{ initiativeOf(c) }}</span>
          <PlayPortrait :combatant="c" :factions="store.factions" />
          <span class="flex min-w-0 flex-1 flex-col gap-1 text-left">
            <span class="truncate text-label-lg" :class="c.hp <= 0 ? 'text-muted-foreground line-through' : ''">{{ c.name }}</span>
            <span class="h-1 overflow-hidden rounded-full bg-secondary" role="img" :aria-label="`${c.hp} of ${c.max_hp} hit points`">
              <span class="block h-full rounded-full" :class="hpTone(c)" :style="{ width: hpPercent(c) + '%' }"></span>
            </span>
          </span>
        </span>
      </AppButton>
    </li>
  </ol>
</template>

<script setup lang="ts">
import AppButton from "@/components/common/controls/AppButton.vue";
import { useEncounterRunStore } from "@/stores/encounterRun";
import type { RunCombatant } from "@/types/encounter.types";
import PlayPortrait from "./PlayPortrait.vue";
import { hpPercent } from "./playHp";

/** The initiative column: one compact row per combatant. HP edits stay in the detail card on the right. */
defineProps<{ selectedId: string | null }>();
const emit = defineEmits<{ select: [instanceId: string] }>();

const store = useEncounterRunStore();

function isTurn(c: RunCombatant): boolean {
  return store.started && c.instance_id === store.activeCombatant?.instance_id;
}
function initiativeOf(c: RunCombatant): string {
  return c.initiative === null ? "–" : String(c.initiative);
}
function hpTone(c: RunCombatant): string {
  const pct = hpPercent(c);
  if (pct > 50) return "bg-tone-success";
  return pct > 25 ? "bg-tone-caution" : "bg-tone-danger";
}
</script>
