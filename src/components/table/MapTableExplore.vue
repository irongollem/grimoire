<template>
  <TableScreen
    v-if="surface"
    :surface="surface"
    :combatants="standing"
    :fog-mask="fogMask"
    :seen="sight"
    :viewers="viewers"
    :follow="follow"
    :eyebrow="eyebrow"
    :title="room?.name ?? null"
    :follow-note="waiting ? 'Waiting for the party' : 'Follows the party'"
    @image-size="imageSize = $event"
  />
  <div v-else class="grid h-dvh place-items-center bg-black p-8 text-center text-2xl text-white/60" data-testid="table-message">
    {{ site ? "This site's map has no grid yet. Line it up in Edit map to show it here." : "Loading the site…" }}
  </div>
</template>

<script setup lang="ts">
/**
 * A map with no fight on it, on the Table screen (epic #1133 decision 6): the party where `campaigns.explore_party`
 * says, the fog the map remembers plus what the party sees now, and the room they are in named in the banner. A map
 * the party is not exploring shows its memory and no tokens. Read only: the DM's window owns the party and the memory.
 */
import { computed, ref } from "vue";
import TableScreen from "@/components/table/TableScreen.vue";
import { usePartySight } from "@/composables/encounters/usePartySight";
import { useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { usePartyTokenSizes } from "@/composables/locations/useExploreParty";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import { useMapMemory } from "@/composables/locations/useMapMemory";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { imageGrid, shownCells, tableTokens } from "@/lib/battlemap/partySight";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { exploreTokens } from "@/lib/locations/explore";
import { partyRoomInSite } from "@/lib/locations/siteRun";
import { isInteriorType } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { partyCentre } from "@/lib/table/tableScreen";
import { useCampaignStore } from "@/stores/campaign";

const props = defineProps<{ placeId: string }>();

const campaign = useCampaignStore();
const placeId = computed(() => props.placeId);
const { surface } = useLocationBattleSurface(placeId);
// The map's own place: a room's table screen is its site's.
const mapId = computed(() => surface.value?.mapLocation.id ?? props.placeId);
const { data: site } = useLocation(mapId);
const { data: children } = useLocations(mapId);

const rooms = computed(() => (children.value ?? []).filter((l) => isInteriorType(l.location_type)).sort(compareSiblings));
const roomId = computed(() =>
  partyRoomInSite(
    campaign.activeCampaign?.current_location_id ?? null,
    rooms.value.map((r) => r.id),
  ),
);
const room = computed(() => rooms.value.find((r) => r.id === roomId.value) ?? null);

// Where each character stands is read, never written: the DM's window owns `explore_party`.
const { data: members } = useActiveParty();
const sizeOf = usePartyTokenSizes(members);
const party = computed(() => exploreTokens(members.value ?? [], campaign.activeCampaign?.explore_party ?? null, mapId.value, sizeOf));
// A character with no square yet is not on the map (the token layer would stack them in a corner).
const standing = computed(() => tableTokens(party.value, new Set()));
const waiting = computed(() => campaign.activeCampaign?.explore_party?.site_id !== mapId.value);
const eyebrow = computed(() => (waiting.value ? "Waiting" : room.value ? "The party is in" : "Exploring"));

const imageSize = ref<{ w: number; h: number } | null>(null);
const grid = computed(() => imageGrid(surface.value?.calibration.cells_per_image_width, imageSize.value));
const { viewers, sight } = usePartySight({
  live: () => surface.value?.live ?? null,
  doorStates: [],
  zones: [],
  tokens: standing,
  grid,
});
const memory = useMapMemory(() => campaign.activeCampaignId, mapId);
const fogMask = computed(() => shownCells(memory.memory.value, sight.value));

const follow = computed(() => {
  const centre = partyCentre(standing.value);
  const lead = standing.value[0];
  return centre && lead ? { position: centre, footprint: combatantFootprint(lead) } : null;
});
</script>
