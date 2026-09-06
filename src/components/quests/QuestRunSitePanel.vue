<template>
  <section class="space-y-2 rounded-xl border border-border bg-card p-3" aria-label="Where the party is">
    <div class="flex flex-wrap items-center justify-between gap-2">
      <p class="text-label font-bold uppercase tracking-wider text-primary">Where the party is</p>
      <RouterLink v-if="site" :to="`/locations/${site.id}`" class="text-caption text-muted-foreground hover:text-primary">
        Open in Atlas
      </RouterLink>
    </div>

    <template v-if="site">
      <p class="font-cinzel text-sm font-bold text-foreground">{{ summary }}</p>
      <div v-if="rooms.length" class="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-4">
        <AppButton
          v-for="room in rooms"
          :key="room.id"
          variant="menu"
          size="xs"
          block
          :to="roomTo(room)"
          @click="onRoomClick(room)"
        >
          <IconLocation v-if="room.id === currentRoomId" class="h-3 w-3 shrink-0 text-primary" aria-hidden="true" />
          <IconLock v-else-if="!isReachable(room.id)" class="h-3 w-3 shrink-0 text-muted-foreground/60" aria-hidden="true" />
          <span class="min-w-0 flex-1 truncate" :class="roomNameClass(room)">{{ room.name }}</span>
          <IconShieldCheck v-if="stateOf(room.id, 'cleared')?.value" class="h-3 w-3 shrink-0 text-tone-success" aria-hidden="true" />
          <IconLoot v-if="stateOf(room.id, 'looted')?.value" class="h-3 w-3 shrink-0 text-tone-caution" aria-hidden="true" />
        </AppButton>
      </div>
      <p v-else class="text-caption italic text-muted-foreground">No rooms mapped yet — add some from the site's own sheet.</p>
      <!-- The distinction the epic is named for: this click walks the party
           around a place, and never touches a quest's cursor (#780). -->
      <p class="text-caption text-muted-foreground">Clicking a room moves the party and marks it explored — nothing here is written to any story.</p>
    </template>
    <p v-else class="text-caption italic text-muted-foreground">The party's position isn't known, or isn't inside a mapped site.</p>
  </section>
</template>

<script setup lang="ts">
/**
 * Concern 1 of the run cockpit (#820, epic #780): where the party physically
 * is, independent of which quest is running. Site state belongs to the Atlas,
 * not to a beat — a party can be mid-dungeon while running a chain that has
 * never anchored a beat there (that join is Phase 3's job, #797) — so this
 * reads `campaigns.current_location_id` directly rather than any beat's
 * `location_set` attachment.
 *
 * A thin, compact sibling of `SiteRunSurface` (#791): same underlying reads
 * and the same one-click move-and-explore write, without the map, the doors
 * editor, or the placements panel — this is a glance-and-click strip meant to
 * sit beside the current beat, not a page of its own.
 */
import { computed } from "vue";
import { RouterLink } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import { IconLocation, IconLock, IconLoot, IconShieldCheck } from "@/lib/icons";
import { useAllLocations } from "@/composables/locations/useLocations";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { compareSiblings } from "@/lib/locations/tree";
import { partyRoomInSite, reachableRoomIds } from "@/lib/locations/siteRun";
import { formatSiteSummary, resolveCurrentSite } from "@/lib/quests/run";
import type { LocationStateFact } from "@/types/locationState.types";
import type { Location } from "@/types/location.types";

const campaign = useCampaignStore();
const toast = useToast();

const { data: allLocations } = useAllLocations();
const partyLocationId = computed(() => campaign.activeCampaign?.current_location_id ?? null);
const site = computed(() => resolveCurrentSite(partyLocationId.value, allLocations.value ?? []));

const rooms = computed<Location[]>(() => {
  const siteId = site.value?.id;
  if (!siteId) return [];
  return (allLocations.value ?? [])
    .filter((location) => location.parent_id === siteId && location.location_type === "room")
    .sort(compareSiblings);
});
const roomIds = computed(() => rooms.value.map((room) => room.id));
const currentRoomId = computed(() => partyRoomInSite(partyLocationId.value, roomIds.value));
const summary = computed(() => site.value ? formatSiteSummary(site.value, rooms.value.length, exploredCount.value) : "");

const doorsQuery = useSiteDoors(roomIds);
// `null` before the party has entered any room of this site — nothing to be
// unreachable from yet, so every room renders and behaves as reachable.
const reachable = computed(() => {
  const from = currentRoomId.value;
  return from ? reachableRoomIds(from, doorsQuery.data.value ?? []) : null;
});
function isReachable(roomId: string): boolean {
  return !reachable.value || reachable.value.has(roomId);
}

const { stateOf } = useLocationStateForRooms(roomIds);
function countWhere(fact: LocationStateFact): number {
  return roomIds.value.filter((id) => stateOf(id, fact)?.value === true).length;
}
const exploredCount = computed(() => countWhere("explored"));

const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();

function moveTo(roomId: string): void {
  if (!campaign.activeCampaignId || isMoving.value || roomId === currentRoomId.value) return;
  setCampaignLocation(
    { id: campaign.activeCampaignId, locationId: roomId },
    { onError: (e) => toast.error(toast.fromError(e)) },
  );
}

function roomTo(room: Location): string | undefined {
  if (room.id === currentRoomId.value) return undefined;
  return isReachable(room.id) ? undefined : `/locations/${room.id}`;
}

function onRoomClick(room: Location): void {
  if (room.id === currentRoomId.value || !isReachable(room.id)) return;
  moveTo(room.id);
}

function roomNameClass(room: Location): string {
  if (room.id === currentRoomId.value) return "text-primary font-semibold";
  if (!isReachable(room.id)) return "text-muted-foreground/70";
  return "text-foreground";
}
</script>
