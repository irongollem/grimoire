<template>
  <TableScreen
    v-if="state.surface.value"
    :surface="state.surface.value"
    :combatants="onMap"
    :fog-mask="state.fogMask.value"
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
  />
  <div v-else class="grid h-dvh place-items-center bg-black p-8 text-center text-2xl text-white/60" data-testid="table-message">
    {{ state.loadingState.value }}
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import TableScreen from "@/components/table/TableScreen.vue";
import { usePlayMapState } from "@/components/encounters/play/usePlayMapState";
import { useNpcs } from "@/composables/npcs/useNpcs";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { tableOnMap, tableOrder, tableTurn, tableVisible } from "@/lib/table/tableScreen";
import { useAppUiStore } from "@/stores/ui/app";

/**
 * The Table screen of a fight (#1125 decision 15): a window the DM opens for a screen the table looks at, drawn in
 * the players' eyes. It follows the live row like any follower window, then shows only what a player may see.
 */
const route = useRoute();
const id = computed(() => route.params.id as string);
const state = usePlayMapState(id, "follower");

const { data: npcRows } = useNpcs();
const visible = computed(() => tableVisible(state.combatants.value, npcRows.value ?? []));
const onMap = computed(() => tableOnMap(visible.value, state.fogMask.value));
const order = computed(() => tableOrder(visible.value));

// The turn is read from the creatures the table knows: an active creature it may not know leaves the banner blank.
const activeInstanceId = computed(() => {
  const active = state.activeInstanceId.value;
  return active !== null && visible.value.some((c) => c.instance_id === active) ? active : null;
});
const active = computed(() => visible.value.find((c) => c.instance_id === activeInstanceId.value) ?? null);
const turn = computed(() => tableTurn(state.round.value, active.value));

// Follow the active token, but only while it stands where the table can see it.
const follow = computed(() => {
  const token = onMap.value.find((c) => c.instance_id === activeInstanceId.value);
  return token?.position ? { position: token.position, footprint: combatantFootprint(token) } : null;
});

// Chromeless, like the Scriptorium: no sidebar or top bar on a screen the table looks at.
const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>
