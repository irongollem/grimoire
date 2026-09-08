<template>
  <div class="flex flex-col gap-6">
    <!-- Context: the site's state at a glance, plus the way back to the
         plain sheet — same query-flag convention `?edit=true` uses. -->
    <div class="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-border bg-card px-4 py-3">
      <div class="flex flex-wrap items-center gap-x-4 gap-y-1 text-caption text-muted-foreground">
        <span>{{ exploredCount }} / {{ rooms.length }} rooms explored</span>
        <span v-if="clearedCount">{{ clearedCount }} cleared</span>
        <span v-if="lootedCount">{{ lootedCount }} looted</span>
        <span v-if="lockedDoorCount" class="text-tone-danger">{{ lockedDoorCount }} doors still locked</span>
      </div>
      <AppButton variant="ghost" size="sm" :icon="IconClose" label="Stop Running" @click="stopRunning" />
    </div>

    <div class="grid grid-cols-1 gap-6 xl:grid-cols-2">
      <!-- The place — the map (once something is traced onto it) plus a
           plain room list, which is what makes a site runnable before any
           of it is traced at all. -->
      <section class="flex flex-col gap-3">
        <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">The Place</h2>

        <LocationMap
          v-if="location.map_url"
          :map-url="location.map_url"
          :pins="location.map_pins"
          :children="pinnableChildren"
          mode="view"
          :show-hidden-pins="true"
          :location-id="location.id"
          show-regions
          :regions="regions"
          :spaces="siteSpaces"
          :calibration="location.grid_calibration"
          run-mode
          :party-room-id="currentRoomId"
          :reachable-room-ids="reachable"
          @move-party="moveTo"
        />

        <SiteRoomList
          :site-id="location.id"
          :rooms="rooms"
          :current-room-id="currentRoomId"
          :reachable="reachable"
          :state-of="stateOf"
          :unwritten-ids="unwrittenIds"
          @move="moveTo"
        />
      </section>

      <!-- The current room — whatever the party is in, composed inline so
           the DM never navigates away to reach any of it (#791's bar). -->
      <section class="flex flex-col gap-4">
        <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">The Current Room</h2>

        <template v-if="currentRoom">
          <div class="flex flex-col gap-2">
            <h3 class="font-cinzel text-base font-bold text-foreground">{{ currentRoom.name }}</h3>
            <RichTextViewer v-if="hasDescription" :content="currentRoom.description" />
          </div>

          <LocationStateControls :location-id="currentRoom.id" />

          <div v-if="campaign.activeCampaignId" class="flex flex-col gap-2">
            <h4 class="font-cinzel text-xs font-bold tracking-wide text-muted-foreground">Loot</h4>
            <LocationLootPanel :location-id="currentRoom.id" :campaign-id="campaign.activeCampaignId" :loot="currentRoomLoot ?? []" />
          </div>

          <div class="flex flex-col gap-2">
            <h4 class="font-cinzel text-xs font-bold tracking-wide text-muted-foreground">Prepared Here</h4>
            <LocationPlacements :location-id="currentRoom.id" />
          </div>

          <div class="flex flex-col gap-2">
            <h4 class="font-cinzel text-xs font-bold tracking-wide text-muted-foreground">Ways out</h4>
            <LocationDoors :room-id="currentRoom.id" :parent-id="location.id" />
          </div>
        </template>
        <p v-else class="text-caption text-muted-foreground italic">
          The party hasn't entered a room here yet — click one on the left to move them in.
        </p>
      </section>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The site runner (#791, epic #780) — one surface to run a dungeon at the
 * table, playable with no quest open at all. It composes the panels
 * #783–#790 already shipped (rooms, doors, placements, durable site state,
 * the clickable map) around the one interaction the epic exists for:
 * clicking a room moves the party there in a single click.
 *
 * Moving the party is one write to `campaigns.current_location_id` — the
 * arrival trigger (`mark_arrival_explored`, #790) records `explored` on its
 * own. Nothing here writes `location_state_events` directly.
 *
 * The caller (`LocationDetailView`) only mounts this on a site-tier
 * location, so nothing here re-checks `location.location_type`.
 *
 * The room list itself is `SiteRoomList` (#850 story H) — shared verbatim
 * with `QuestSiteHandoff`'s in-quest room panel, so "can the party reach this
 * room" and "what does an unwritten room look like" have exactly one answer
 * rather than two components that drift.
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import AppButton from "@/components/common/AppButton.vue";
import RichTextViewer from "@/components/common/RichTextViewer.vue";
import LocationDoors from "@/components/locations/LocationDoors.vue";
import LocationLootPanel from "@/components/locations/LocationLootPanel.vue";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationPlacements from "@/components/locations/LocationPlacements.vue";
import LocationStateControls from "@/components/locations/LocationStateControls.vue";
import SiteRoomList from "@/components/locations/SiteRoomList.vue";
import { IconClose } from "@/lib/icons";
import { useLocations } from "@/composables/locations/useLocations";
import { bindableSpaces } from "@/lib/locations/tiers";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { compareSiblings } from "@/lib/locations/tree";
import { partyRoomInSite, reachableRoomIds as computeReachableRoomIds } from "@/lib/locations/siteRun";
import { unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import { extractTiptapText } from "@/lib/utils";
import type { LocationStateFact } from "@/types/locationState.types";
import type { Location } from "@/types/location.types";

const { location } = defineProps<{ location: Location }>();

const route = useRoute();
const router = useRouter();
const toast = useToast();
const campaign = useCampaignStore();

// ── Rooms, in the DM's manual order — the same comparator the Atlas and
//    SiteRoomsPanel use, so this list matches how the DM already arranged
//    them rather than inventing a second order. ─────────────────────────────
const siteId = computed(() => location.id);
const { data: children } = useLocations(siteId);
const rooms = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type === "room").sort(compareSiblings),
);
const roomIds = computed(() => rooms.value.map((r) => r.id));
// What a traced shape on this map may be bound to: a room, or a nested site
// such as a courtyard inside this dungeon (#818).
const siteSpaces = computed(() => bindableSpaces(children.value ?? []));

// Pins are for this site's non-room children (another nested site, say) —
// rooms are placed by a region, never a pin (#807).
const pinnableChildren = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => l.location_type !== "room"),
);

// ── Where the party is, and what it can reach from there ────────────────────
const currentRoomId = computed(() =>
  partyRoomInSite(campaign.activeCampaign?.current_location_id ?? null, roomIds.value),
);
const currentRoom = computed(() => rooms.value.find((r) => r.id === currentRoomId.value) ?? null);
const { data: currentRoomLoot } = useLootPlacements({ locationId: computed(() => currentRoom.value?.id ?? "") });

const doorsQuery = useSiteDoors(roomIds);
const doors = computed(() => doorsQuery.data.value ?? []);
// `null` before the party has entered any room of this site — nothing to be
// unreachable from yet, so every room renders and behaves as reachable.
const reachable = computed(() => {
  const from = currentRoomId.value;
  return from ? computeReachableRoomIds(from, doors.value) : null;
});
const unwrittenIds = computed(() => unwrittenRoomIds(rooms.value));

// The composite (`LocationMap.vue`) mounts whenever `location.map_url`
// exists, same gate `LocationSheet` uses — a site with nothing traced yet is
// still fully runnable via the room list above, but a reference image alone
// is worth showing. Its own regions apparatus (canvas, calibration prompt,
// room-shapes list — hidden here anyway, see `run-mode` below) additionally
// gates on having a room or a region at all, so an untraced site's map still
// renders without a noisy empty grid.
const regionsQuery = useLocationMapRegions(siteId);
const regions = computed(() => regionsQuery.data.value ?? []);

// ── Moving the party ──────────────────────────────────────────────────────
const { mutate: setCampaignLocation, isPending: isMoving } = useSetCampaignLocation();

function moveTo(roomId: string): void {
  if (!campaign.activeCampaignId || isMoving.value || roomId === currentRoomId.value) return;
  setCampaignLocation(
    { id: campaign.activeCampaignId, locationId: roomId },
    { onError: (e) => toast.error(toast.fromError(e)) },
  );
}

// ── Context: the site's own state at a glance ────────────────────────────────
const { stateOf } = useLocationStateForRooms(roomIds);

function countWhere(fact: LocationStateFact): number {
  return roomIds.value.filter((id) => stateOf(id, fact)?.value === true).length;
}
const exploredCount = computed(() => countWhere("explored"));
const clearedCount = computed(() => countWhere("cleared"));
const lootedCount = computed(() => countWhere("looted"));
const lockedDoorCount = computed(() => doors.value.filter((d) => d.starts_locked).length);

const hasDescription = computed(
  () => !!currentRoom.value && extractTiptapText(currentRoom.value.description, 1).length > 0,
);

// ── Exit — same query-flag convention `LocationEditor`'s Cancel uses for
//    `?edit=true`. ────────────────────────────────────────────────────────
function stopRunning(): void {
  const { run: _run, ...rest } = route.query;
  router.push({ query: rest });
}
</script>
