<template>
  <span
    class="relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full border-2 bg-secondary text-label font-bold text-muted-foreground"
    :class="sizeClass"
    :style="{ borderColor: ringColor }"
    aria-hidden="true"
  >
    <img v-if="combatant.portrait_url" :src="combatant.portrait_url" alt="" class="h-full w-full object-cover" loading="lazy" />
    <template v-else>{{ combatant.name.slice(0, 1).toUpperCase() }}</template>
  </span>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { DEFAULT_FACTIONS, type FactionColor, type RunCombatant } from "@/types/encounter.types";

/** A round portrait ringed in its faction's colour, the way the token wears it on the map. */
const { combatant, factions, size = "md" } = defineProps<{
  combatant: RunCombatant;
  factions: readonly FactionColor[];
  size?: "sm" | "md";
}>();

const ringColor = computed(() => {
  const list = factions.length ? factions : DEFAULT_FACTIONS;
  return list.find((f) => f.id === combatant.faction_id)?.color ?? "#3b82f6";
});
const sizeClass = computed(() => (size === "sm" ? "size-8" : "size-9"));
</script>
