<template>
  <TableScreen
    v-if="surface"
    :surface="surface"
    :combatants="standing"
    :fog-mask="fogMask"
    :follow="follow"
    :eyebrow="eyebrow"
    :title="room?.name ?? null"
    follow-note="Follows the party"
  />
  <div v-else class="grid h-dvh place-items-center bg-black p-8 text-center text-2xl text-white/60" data-testid="table-message">
    {{ site ? "This site's map has no grid yet. Line it up in Edit map to show it here." : "Loading the site…" }}
  </div>
</template>

<script setup lang="ts">
/**
 * The Table screen while exploring (#1125 frame 13, decision 15): the site's map in the players' eyes. The party stands
 * where `campaigns.explore_party` says, rooms the party has explored are lit and everything else is black, and the
 * banner names the room they are in. No initiative ribbon: nothing is being fought.
 */
import { computed, onBeforeUnmount, onMounted } from "vue";
import { useRoute } from "vue-router";
import TableScreen from "@/components/table/TableScreen.vue";
import { useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { usePartyTokenSizes } from "@/composables/locations/useExploreParty";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { exploreTokens, roomBattleCells } from "@/lib/locations/explore";
import { isInteriorType } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { partyRoomInSite } from "@/lib/locations/siteRun";
import { partyCentre, siteFogMask } from "@/lib/table/tableScreen";
import { useCampaignStore } from "@/stores/campaign";
import { useAppUiStore } from "@/stores/ui/app";

const route = useRoute();
const campaign = useCampaignStore();
const siteId = computed(() => route.params.id as string);
const { data: site } = useLocation(siteId);
const { data: children } = useLocations(siteId);
const { surface, regions: regionRows } = useLocationBattleSurface(siteId);

const rooms = computed(() => (children.value ?? []).filter((l) => isInteriorType(l.location_type)).sort(compareSiblings));
const roomIds = computed(() => rooms.value.map((r) => r.id));
const { stateOf } = useLocationStateForRooms(roomIds);
const roomId = computed(() => partyRoomInSite(campaign.activeCampaign?.current_location_id ?? null, roomIds.value));
const room = computed(() => rooms.value.find((r) => r.id === roomId.value) ?? null);
const eyebrow = computed(() => (room.value ? "The party is in" : "Exploring"));

// Where each character stands is read, never written: the DM's window owns `explore_party`.
const { data: members } = useActiveParty();
const sizeOf = usePartyTokenSizes(members);
const party = computed(() => exploreTokens(members.value ?? [], campaign.activeCampaign?.explore_party ?? null, siteId.value, sizeOf));

// A character with no square yet is not on the map (the token layer would stack them in a corner).
const standing = computed(() => party.value.filter((c) => c.position));

// Explored rooms are lit; the rest is black until the DM reveals it (#1125 decision 9). A room the party stands in counts.
const fogMask = computed(() => {
  if (!surface.value) return new Set<string>();
  const cellsByRoom = roomBattleCells(regionRows.value ?? [], surface.value.calibration);
  const lit = rooms.value
    .filter((r) => r.id === roomId.value || stateOf(r.id, "explored")?.value === true)
    .map((r) => cellsByRoom.get(r.id) ?? []);
  return siteFogMask(lit, party.value);
});

const follow = computed(() => {
  const centre = partyCentre(party.value);
  const lead = party.value.find((c) => c.position);
  return centre && lead ? { position: centre, footprint: combatantFootprint(lead) } : null;
});

const appUi = useAppUiStore();
onMounted(() => {
  appUi.editorFocus = true;
});
onBeforeUnmount(() => {
  appUi.editorFocus = false;
});
</script>
