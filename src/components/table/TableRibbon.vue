<template>
  <ol class="ribbon" data-testid="table-ribbon" aria-label="Initiative order">
    <li
      v-for="c in order"
      :key="c.instance_id"
      class="entry"
      :class="{ current: c.instance_id === activeInstanceId }"
      :data-testid="c.instance_id === activeInstanceId ? 'table-ribbon-current' : 'table-ribbon-entry'"
    >
      <span class="face" :style="{ borderColor: ringOf(c) }">
        <img v-if="c.portrait_url" :src="c.portrait_url" alt="" class="h-full w-full object-cover" />
        <template v-else>{{ c.name.slice(0, 1).toUpperCase() }}</template>
      </span>
      <span class="name">{{ c.name }}</span>
    </li>
  </ol>
</template>

<script setup lang="ts">
import { DEFAULT_FACTIONS, type FactionColor, type RunCombatant } from "@/types/encounter.types";

/** The initiative order across the top of the Table screen (#1125 frame 13): portraits ringed in their faction's colour. */
const { order, factions, activeInstanceId = null } = defineProps<{
  order: readonly RunCombatant[];
  factions: readonly FactionColor[];
  activeInstanceId?: string | null;
}>();

function ringOf(c: RunCombatant): string {
  const list = factions.length ? factions : DEFAULT_FACTIONS;
  return list.find((f) => f.id === c.faction_id)?.color ?? "#3b82f6";
}
</script>

<style scoped>
.ribbon {
  display: flex;
  align-items: flex-end;
  gap: 1rem;
  max-width: 90%;
  margin: 0;
  padding: 0.75rem 1.5rem;
  list-style: none;
  overflow: hidden;
  border-radius: 9999px;
  background: rgb(10 8 6 / 0.62);
  backdrop-filter: blur(6px);
  border: 1px solid rgb(255 255 255 / 0.12);
}
.entry {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.25rem;
  min-width: 0;
  opacity: 0.8;
}
.face {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 3rem;
  height: 3rem;
  overflow: hidden;
  border-radius: 9999px;
  border: 3px solid;
  background: rgb(255 255 255 / 0.1);
  color: rgb(255 255 255 / 0.8);
  font-weight: 700;
}
.name {
  max-width: 5.5rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.8125rem;
  color: rgb(255 255 255 / 0.85);
}
.current {
  opacity: 1;
}
.current .face {
  width: 4.5rem;
  height: 4.5rem;
  box-shadow: 0 0 0 4px #9a2434, 0 0 1.5rem rgb(154 36 52 / 0.6);
}
.current .name {
  max-width: 8rem;
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 1.125rem;
  font-weight: 700;
  color: #fff;
}
</style>
