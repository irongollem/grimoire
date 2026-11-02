<template>
  <TableScreen
    v-if="state.surface.value"
    :surface="state.surface.value"
    :combatants="onMap"
    :fog-mask="fogMask"
    :seen="state.sight.value"
    :viewers="state.viewers.value"
    :factions="state.factions.value"
    :monsters="state.monsters.value"
    :active-instance-id="activeInstanceId"
    :door-states="state.doorStates.value"
    :zones="state.darknessZones.value"
    :follow="follow"
    :order="order"
    :eyebrow="turn.eyebrow"
    :title="turn.title"
    :message="state.loadingState.value"
    @image-size="imageSize = $event"
  />
  <div v-else class="grid h-dvh place-items-center bg-black p-8 text-center text-2xl text-white/60" data-testid="table-message">
    {{ state.loadingState.value }}
  </div>
</template>

<script setup lang="ts">
/**
 * A fight on this map, on the Table screen (epic #1133 decision 6): the ribbon, the monsters and whose turn it is, in
 * the players' eyes. It follows the live row like any follower window and never writes anything; what is shown is the
 * map's memory plus what the party sees now (decision 1), and a monster only where the party sees it.
 */
import { computed, ref, toRef } from "vue";
import TableScreen from "@/components/table/TableScreen.vue";
import { usePlayMapState } from "@/components/encounters/play/usePlayMapState";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { shownCells, tableTokens } from "@/lib/battlemap/partySight";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { tableOrder, tableTurn, tableVisible } from "@/lib/table/tableScreen";

const props = defineProps<{ encounterId: string }>();

const imageSize = ref<{ w: number; h: number } | null>(null);
const state = usePlayMapState(toRef(props, "encounterId"), "follower", imageSize);

const { data: npcRows } = useNpcs();
const visible = computed(() => tableVisible(state.combatants.value, npcRows.value ?? []));
// Every player's coin always; a monster only where the party sees it.
const onMap = computed(() => tableTokens(visible.value, state.sight.value));
const order = computed(() => tableOrder(visible.value));
const fogMask = computed(() => shownCells(state.memory.value, state.sight.value));

// The turn is read from the creatures the table knows: an active creature it may not know leaves the banner blank.
const activeInstanceId = computed(() => {
  const active = state.activeInstanceId.value;
  return active !== null && visible.value.some((c) => c.instance_id === active) ? active : null;
});
const active = computed(() => visible.value.find((c) => c.instance_id === activeInstanceId.value) ?? null);
const turn = computed(() => tableTurn(state.round.value, active.value));

// Follow the active token, but only while it is drawn.
const follow = computed(() => {
  const token = onMap.value.find((c) => c.instance_id === activeInstanceId.value);
  return token?.position ? { position: token.position, footprint: combatantFootprint(token) } : null;
});
</script>
