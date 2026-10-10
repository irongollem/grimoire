<template>
  <section class="space-y-3 rounded-lg border border-border bg-card p-3" aria-label="Room loot">
    <LootPlacementList
      title="Loot"
      empty-label="No loot prepared for this room."
      :loot="loot"
      @dropped="onDropped"
    />

    <!-- The form reads the loot tables and the item index, so it mounts on
         first open and stays mounted (a half-built entry survives a collapse)
         instead of fetching both for every place the DM merely looks at
         (#972). -->
    <AppButton
      v-if="!formOpen"
      label="Add loot"
      variant="ghost"
      size="sm"
      :icon="IconAdd"
      class="self-start"
      @click="formOpen = true"
    />
    <LocationLootForm v-if="formOpen" :location-id="locationId" :campaign-id="campaignId" :loot-count="loot.length" />
  </section>
</template>

<script setup lang="ts">
/**
 * A room's loot (#830) — the location-homed sibling of the beat's `QuestPayoffPanel`.
 * The list half (entries, drop/remove, status) is shared verbatim via
 * `LootPlacementList`; the "prepare" form is `LocationLootForm`, which is not
 * a props-driven variation of the beat's — a room can roll a loot table into
 * a held chest and a beat has no use for that at all, so the two forms stay
 * separate files rather than one component branching on a home type.
 *
 * `dispatch_loot` records the room's `looted` fact as part of the same
 * transaction that drops loot to chat (#830) — this component never writes
 * `location_state_events` itself, it only invalidates the query cache that
 * fact lives in once `LootPlacementList` reports a successful drop, so
 * `LocationStateControls` picks up the change without a reload.
 */
import { ref } from "vue";
import { useQueryClient } from "@tanstack/vue-query";
import { LOCATION_STATE_QUERY_KEY } from "@/composables/locations/useLocationState";
import { IconAdd } from "@/lib/icons";
import AppButton from "@/components/common/controls/AppButton.vue";
import LocationLootForm from "@/components/locations/place/LocationLootForm.vue";
import LootPlacementList from "@/components/quests/inspector/LootPlacementList.vue";
import type { LootPlacement } from "@/types/quest.types";

const { locationId, campaignId, loot } = defineProps<{ locationId: string; campaignId: string; loot: LootPlacement[] }>();

const queryClient = useQueryClient();
const formOpen = ref(false);

function onDropped() {
  // The database recorded the room's `looted` fact as part of the drop
  // (#830) — this just tells the Progress panel's query to go re-read it.
  void queryClient.invalidateQueries({ queryKey: [LOCATION_STATE_QUERY_KEY] });
}
</script>
