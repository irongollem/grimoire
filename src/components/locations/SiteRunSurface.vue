<template>
  <div class="flex flex-col gap-4">
    <SiteRunHeader
      :site-name="location.name"
      :quest-title="currentBeat?.quest?.title ?? null"
      :party-room-name="currentRoom?.name ?? null"
      :back-to-beat="backToBeatTarget"
      @stop="stopRunning"
    />

    <div class="grid grid-cols-1 gap-4 xl:grid-cols-[20rem_minmax(0,1fr)_20rem]">
      <!-- Rooms — the plain click-to-move list, which is what makes a site
           runnable before any of it is traced. -->
      <section class="flex flex-col gap-3">
        <h2 class="font-cinzel text-sm font-bold tracking-wide text-foreground">Rooms</h2>
        <SiteRoomList
          :site-id="location.id"
          :rooms="rooms"
          :current-room-id="currentRoomId"
          :reachable="reachable"
          :state-of="stateOf"
          :unwritten-ids="unwrittenIds"
          run-captions
          :secret-undiscovered-ids="secretUndiscoveredIds"
          :zone-notes="zoneNotes"
          @move="moveTo"
        />
      </section>

      <!-- The place — the map, in run mode, and the room stack under it. -->
      <div class="flex flex-col gap-4">
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

        <SiteRunRoomStack
          v-if="currentRoom"
          :site-id="location.id"
          :room="currentRoom"
          :regions="regions"
          :doors="doors"
          :door-state="doorStateOf"
          :loot="currentRoomLoot ?? []"
          :campaign-id="campaign.activeCampaignId"
        />
        <p v-else class="rounded-xl border border-dashed border-border p-4 text-caption italic text-muted-foreground">
          The party hasn't entered a room here yet — click one on the left to move them in.
        </p>
      </div>

      <!-- Beat card (when one is staged here), ways out, progress. -->
      <div class="flex flex-col gap-4">
        <SiteRunBeatCard v-if="currentBeat" :beat="currentBeat" />

        <SiteRunWaysOut
          v-if="currentRoom"
          :site-id="location.id"
          :room-id="currentRoom.id"
          :room-name="currentRoom.name"
          :doors="doors"
          :door-state="doorStateOf"
        />

        <section v-if="currentRoom" class="flex flex-col gap-2 rounded-xl border border-border bg-card p-3">
          <h3 class="font-cinzel text-sm font-bold text-foreground">Progress</h3>
          <p class="text-caption text-muted-foreground">{{ currentRoom.name }}</p>
          <LocationStateControls :location-id="currentRoom.id" />
        </section>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
/**
 * The site runner (#791, epic #780; reshaped for #868's frames 08/11) — one
 * surface to run a dungeon at the table. A room is a zoomed-in beat (the
 * maintainer's framing for this story), so the current room reuses the
 * beat's own presentation pieces rather than inventing room equivalents:
 * `SiteRunRoomStack` is the read-aloud + attachment-row + payoff-list idiom
 * turned on a room, and `SiteRunBeatCard` is the literal beat card for the
 * case where a beat is staged here and no quest cockpit is open.
 *
 * Moving the party is still one write to `campaigns.current_location_id` —
 * the arrival trigger (`mark_arrival_explored`, #790) records `explored` on
 * its own. Unlocking or revealing a door is one door-fact assertion
 * (`SiteRunWaysOut`); nothing here writes `location_state_events` directly.
 *
 * The caller (`LocationDetailView`) only mounts this on a site-tier
 * location, so nothing here re-checks `location.location_type`.
 */
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import LocationMap from "@/components/locations/LocationMap.vue";
import LocationStateControls from "@/components/locations/LocationStateControls.vue";
import SiteRoomList from "@/components/locations/SiteRoomList.vue";
import SiteRunHeader from "@/components/locations/SiteRunHeader.vue";
import SiteRunBeatCard from "@/components/locations/SiteRunBeatCard.vue";
import SiteRunWaysOut from "@/components/locations/SiteRunWaysOut.vue";
import SiteRunRoomStack from "@/components/locations/SiteRunRoomStack.vue";
import { useLocations } from "@/composables/locations/useLocations";
import { bindableSpaces } from "@/lib/locations/tiers";
import { useLocationMapRegions } from "@/composables/locations/useLocationMapRegions";
import { useLootPlacements } from "@/composables/quests/useQuestFlow";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useLocationStateForRooms, useDoorStateForSite } from "@/composables/locations/useLocationState";
import { useSetCampaignLocation } from "@/composables/campaign/useCampaigns";
import { useBeatsStagedAt } from "@/composables/quests/useBeatsStagedAt";
import { useCampaignStore } from "@/stores/campaign";
import { useToast } from "@/composables/useToast";
import { compareSiblings } from "@/lib/locations/tree";
import { partyRoomInSite, reachableRoomIds as computeReachableRoomIds } from "@/lib/locations/siteRun";
import { unwrittenRoomIds } from "@/lib/quests/siteHandoff";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import { zoneSummary } from "@/lib/locations/zones";
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
const currentRoomIdOrEmpty = computed(() => currentRoom.value?.id ?? "");
const { data: currentRoomLoot } = useLootPlacements({ locationId: currentRoomIdOrEmpty });

const doorsQuery = useSiteDoors(roomIds);
const doors = computed(() => doorsQuery.data.value ?? []);
const { stateOf: doorStateOf } = useDoorStateForSite(siteId);
// `null` before the party has entered any room of this site — nothing to be
// unreachable from yet, so every room renders and behaves as reachable.
const reachable = computed(() => {
  const from = currentRoomId.value;
  if (!from) return null;
  const unlocked = new Set(doors.value.filter((d) => doorStateOf(d.id, "unlocked")?.value === true).map((d) => d.id));
  return computeReachableRoomIds(from, doors.value, unlocked);
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

// ── Frame 08's room-list subtitles: a room whose only known doors are all
//    secret and undiscovered gets its own caption rather than a plain
//    "Reachable" (`reachableRoomIds` doesn't treat a secret door as blocking
//    movement at all — a DM already knows their own map — so this is a
//    presentation signal, not a second reachability graph). ────────────────
const secretUndiscoveredIds = computed(() => {
  const bySpace = new Map<string, typeof doors.value>();
  for (const door of doors.value) {
    for (const spaceId of new Set([door.from_location_id, door.to_location_id])) {
      const existing = bySpace.get(spaceId);
      if (existing) existing.push(door);
      else bySpace.set(spaceId, [door]);
    }
  }
  const ids = new Set<string>();
  for (const room of rooms.value) {
    const incident = bySpace.get(room.id) ?? [];
    if (incident.length && incident.every((d) => d.is_secret && doorStateOf(d.id, "found")?.value !== true)) {
      ids.add(room.id);
    }
  }
  return ids;
});

// The current room's own active zone, named for the "Party here · <zone>
// active" caption — the same zone-over-room-cells intersection
// `buildRoomStack` uses for trigger zones, but any zone kind qualifies here.
const zoneNotes = computed(() => {
  const map = new Map<string, string>();
  const roomId = currentRoomId.value;
  const roomRegion = roomId ? regions.value.find((r) => r.region_role === "space" && r.space_location_id === roomId) : undefined;
  if (!roomId || !roomRegion) return map;
  const roomCells = new Set(roomRegion.cells);
  const zone = regions.value.find((r) => r.region_role === "zone" && r.cells.some((c) => roomCells.has(c)));
  const note = zone ? zone.label || zoneSummary(zone) : "";
  if (note) map.set(roomId, note);
  return map;
});

// ── A beat staged at the site or the party's current room — shown only when
//    one exists, so a DM who opened the Atlas outside any quest sees nothing
//    extra. ───────────────────────────────────────────────────────────────
const beatSpaceIds = computed(() => [location.id, ...(currentRoomId.value ? [currentRoomId.value] : [])]);
const { data: stagedBeats } = useBeatsStagedAt(beatSpaceIds);
const currentBeat = computed(() => {
  const beats = stagedBeats.value ?? [];
  if (!beats.length) return null;
  // A beat staged at the room the party is standing in is more relevant
  // right now than one staged at the site in general; ties broken by most
  // recently touched, so a DM's latest edit wins over an older staging.
  const atRoom = currentRoomId.value ? beats.filter((b) => b.staged_at_location_id === currentRoomId.value) : [];
  const candidates = atRoom.length ? atRoom : beats.filter((b) => b.staged_at_location_id === location.id);
  return [...candidates].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
});
const backToBeatTarget = computed<RouteLocationRaw | null>(() =>
  currentBeat.value ? questSurfaceReturnTo(currentBeat.value.quest_id, currentBeat.value.id, "run") : null,
);

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

// ── Exit — same query-flag convention `LocationEditor`'s Cancel uses for
//    `?edit=true`. ────────────────────────────────────────────────────────
function stopRunning(): void {
  const { run: _run, ...rest } = route.query;
  router.push({ query: rest });
}
</script>
