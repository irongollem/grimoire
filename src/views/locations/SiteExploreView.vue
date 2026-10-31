<template>
  <div v-if="!site" class="flex h-full items-center justify-center"><LoadingSpinner /></div>
  <PlayShell v-else left-label="The party and rooms" right-label="The room ahead">
    <template #bar>
      <header class="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-border bg-card px-4 py-2">
        <AppButton variant="ghost" size="sm" :icon="IconChevronLeft" label="Atlas" data-testid="explore-back" @click="backToAtlas" />
        <h1 class="max-w-[16rem] truncate text-heading-sm font-bold text-foreground">{{ site.name }}</h1>
        <span class="rounded-full border border-tone-caution/40 bg-tone-caution/10 px-3 py-1 text-label-lg font-semibold text-ink-caution">Exploring</span>
        <ManualHelpLink page="sites-maps-rooms-running-a-dungeon" />

        <div class="ml-auto flex flex-wrap items-center gap-2">
          <AppButton
            variant="outline"
            size="sm"
            :icon="IconMonitor"
            label="Table screen"
            tooltip="Open the table screen in a new window (for a second monitor)"
            data-testid="explore-table-screen"
            @click="openTableScreen"
          />
          <PlayViewMenu v-model="view" :only="VIEW_ENTRIES" :labels="{ showZones: 'Room names' }" @reset-view="map?.resetView()" />
          <AppButton
            variant="live"
            size="sm"
            :icon="IconEncounter"
            label="Start a fight"
            :loading="starting"
            data-testid="explore-start-fight"
            @click="startFight"
          />
        </div>
      </header>
    </template>

    <template #left>
      <ExplorePartyPanel
        :members="tokens"
        :selection="selection"
        :rooms="roomRows"
        @select-party="selectParty"
        @select-one="selectOne"
        @go="goToRoom"
      />
    </template>

    <template #map>
      <ExploreMap
        v-if="surface"
        ref="map"
        :surface="surface"
        :tokens="tokens"
        :rooms="roomLabels"
        :shaded-cells="shadedCells"
        :entering-cells="enteringCells"
        :view="view"
        :selected-id="selectedId"
        :group-ids="groupIds"
        @move="onMove"
        @select="onSelect"
        @update:group-ids="groupIds = $event"
      >
        <!-- Asked once the lead token steps into a room the party has not seen: reveal it, or keep walking. -->
        <div
          v-if="askRoom"
          data-slip
          data-testid="explore-reveal-slip"
          class="absolute left-1/2 top-3 flex -translate-x-1/2 flex-wrap items-center justify-center gap-3 rounded-md border border-border bg-popover px-4 py-2 shadow-lg"
        >
          <p class="text-body text-foreground">The party steps into the <strong>{{ askRoom.name }}</strong>.</p>
          <AppButton variant="live" size="sm" label="Reveal the room" @click="revealRoom(askRoom.id)" />
          <AppButton variant="ghost" size="sm" label="Not yet" @click="notYet(askRoom.id)" />
        </div>
      </ExploreMap>

      <!-- No calibrated grid yet: the site plan, as the old runner drew it. Click a room to move the party. -->
      <div v-else-if="hasAnyMapLayer(site)" class="h-full overflow-y-auto p-4" data-testid="explore-plan">
        <LocationMap
          :stack="mapStack"
          :pins="site.map_pins"
          :children="pinnableChildren"
          mode="view"
          :show-hidden-pins="true"
          show-regions
          :regions="regions"
          :spaces="siteSpaces"
          run-mode
          :party-room-id="currentRoomId"
          :reachable-room-ids="reachable"
          show-fog
          :fog-glimpsed-cells="fogGlimpsedCells"
          @move-party="goToRoom"
        />
        <p class="mt-3 text-caption text-muted-foreground">
          This site's map has no grid yet, so the party moves room to room. Line the grid up in Edit map and they walk it square by square.
        </p>
      </div>
      <p v-else class="p-6 text-body text-muted-foreground">This site has no map yet. Move the party with the room list on the left.</p>
    </template>

    <template #right>
      <div v-if="triggerBeat && showTriggerPrompt" class="px-4 pt-4">
        <TriggerBeatPrompt :beat="{ title: triggerBeat.title }" @advance="advanceTriggerBeat" @dismiss="dismissTriggerPrompt" />
      </div>
      <ExploreRoomCard
        :site-id="site.id"
        :room="cardRoom"
        :entering="enteringRoom !== null"
        :regions="regions"
        :doors="doors"
        :door-state="doorStateOf"
        :loot="roomLoot"
        :campaign-id="campaign.activeCampaignId"
        :beat="currentBeat"
      />
    </template>
  </PlayShell>
</template>

<script setup lang="ts">
/**
 * Exploring a site (#1125 decision 9, canvas frame 09): the Play screen with the party walking the site's map. It
 * replaces the Atlas pane's Run layout. Where the party is as a ROOM is still `campaigns.current_location_id`
 * (moved with `useMoveParty`, whose arrival trigger records the room explored); where each character stands on the
 * grid is `campaigns.explore_party`, which a fight started here reads to seat everyone where they were.
 */
import { computed, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { RouteLocationRaw } from "vue-router";
import AppButton from "@/components/common/controls/AppButton.vue";
import LoadingSpinner from "@/components/common/feedback/LoadingSpinner.vue";
import ManualHelpLink from "@/components/common/ManualHelpLink.vue";
import PlayShell from "@/components/encounters/play/PlayShell.vue";
import PlayViewMenu from "@/components/encounters/play/PlayViewMenu.vue";
import { DEFAULT_PLAY_VIEW, type PlayViewState } from "@/components/encounters/play/playTypes";
import ExploreMap from "@/components/locations/explore/ExploreMap.vue";
import ExplorePartyPanel from "@/components/locations/explore/ExplorePartyPanel.vue";
import ExploreRoomCard from "@/components/locations/explore/ExploreRoomCard.vue";
import LocationMap from "@/components/locations/map/LocationMap.vue";
import TriggerBeatPrompt from "@/components/locations/run/TriggerBeatPrompt.vue";
import { useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { useStartFight } from "@/composables/encounters/useStartFight";
import { useActiveParty } from "@/composables/party/useActiveParty";
import { useExploreParty, usePartyTokenSizes } from "@/composables/locations/useExploreParty";
import { useLocation, useLocations } from "@/composables/locations/useLocations";
import { useDoorStateForSite, useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { useMoveParty } from "@/composables/locations/useMoveParty";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { useBeatsStagedAt } from "@/composables/quests/useBeatsStagedAt";
import { useLootPlacements, useQuestBeat } from "@/composables/quests/useQuestFlow";
import { useHotkeys } from "@/composables/useHotkeys";
import { IconChevronLeft, IconEncounter, IconMonitor } from "@/lib/icons";
import {
  roomBattleCells,
  roomBeingEntered,
  roomCellIndex,
  seedPartyPositions,
  type ExploreCell,
  type RoomExploreState,
} from "@/lib/locations/explore";
import { buildMapStack, hasAnyMapLayer } from "@/lib/locations/mapStack";
import { placeRoute } from "@/lib/locations/placeRoute";
import { buildDmFogPlan } from "@/lib/locations/siteFog";
import { partyRoomInSite, siteReachability } from "@/lib/locations/siteRun";
import { bindableSpaces, isInteriorType, isSiteType } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { questSurfaceReturnTo } from "@/lib/quests/navigation";
import { useCampaignStore } from "@/stores/campaign";
import { useLocationsUiStore } from "@/stores/ui/locations";
import type { Location } from "@/types/location.types";

const route = useRoute();
const router = useRouter();
const campaign = useCampaignStore();
const locationsUi = useLocationsUiStore();

const siteId = computed(() => route.params.id as string);
const { data: site } = useLocation(siteId);

// Only a site has a floor plan to walk; anything else is the Atlas's to show.
watch(
  site,
  (loaded) => {
    if (loaded && !isSiteType(loaded.location_type)) void router.replace(placeRoute(loaded.id));
  },
  { immediate: true },
);

// ── The site: its rooms in the DM's order, doors, regions ───────────────────
const { data: children } = useLocations(siteId);
const rooms = computed<Location[]>(() =>
  (children.value ?? []).filter((l) => isInteriorType(l.location_type)).sort(compareSiblings),
);
const roomIds = computed(() => rooms.value.map((r) => r.id));
const siteSpaces = computed(() => bindableSpaces(children.value ?? []));
const pinnableChildren = computed<Location[]>(() => (children.value ?? []).filter((l) => !isInteriorType(l.location_type)));
const { stateOf } = useLocationStateForRooms(roomIds);
const isExplored = (roomId: string) => stateOf(roomId, "explored")?.value === true;

const { surface, regions: regionRows } = useLocationBattleSurface(siteId);
const regions = computed(() => regionRows.value ?? []);
const doorsQuery = useSiteDoors(roomIds);
const doors = computed(() => doorsQuery.data.value ?? []);
const { stateOf: doorStateOf } = useDoorStateForSite(siteId);

// ── Where the party is as a room, and what it can reach ─────────────────────
const currentRoomId = computed(() => partyRoomInSite(campaign.activeCampaign?.current_location_id ?? null, roomIds.value));
const currentRoom = computed(() => rooms.value.find((r) => r.id === currentRoomId.value) ?? null);
const reachable = computed(() => {
  const unlocked = new Set(doors.value.filter((d) => doorStateOf(d.id, "unlocked")?.value === true).map((d) => d.id));
  return siteReachability(currentRoomId.value, doors.value, unlocked);
});
const { moveParty } = useMoveParty();

// ── Where each character stands on the grid ─────────────────────────────────
const { data: party } = useActiveParty();
const roomCells = computed(() => (surface.value ? roomBattleCells(regions.value, surface.value.calibration) : null));
const roomIndex = computed(() => (surface.value ? roomCellIndex(regions.value, surface.value.calibration) : new Map()));
const sizeOf = usePartyTokenSizes(party);
const { tokens, place } = useExploreParty({
  siteId,
  members: () => (surface.value ? party.value : undefined),
  roomCells,
  roomOrder: roomIds,
  partyRoomId: currentRoomId,
  sizeOf,
});

// ── Who moves: everyone, until the DM picks one token ───────────────────────
const selectedId = ref<string | null>(null);
const groupIds = ref<string[]>([]);
const tokenIds = computed(() => tokens.value.map((t) => t.instance_id));
const selection = computed<ReadonlySet<string>>(() => new Set(groupIds.value.length > 1 ? groupIds.value : selectedId.value ? [selectedId.value] : []));

function selectParty() {
  groupIds.value = tokenIds.value.length > 1 ? tokenIds.value : [];
  selectedId.value = tokenIds.value[0] ?? null;
}
function selectOne(instanceId: string) {
  groupIds.value = [];
  selectedId.value = instanceId;
}
// Nothing picked (or the party changed under the pick) means everyone.
watch(
  tokenIds,
  (ids) => {
    if (selectedId.value === null || !ids.includes(selectedId.value)) selectParty();
  },
  { immediate: true },
);
function onSelect(id: string | null) {
  if (id === null) selectParty();
  else selectedId.value = id;
}
useHotkeys(() => [{ combo: "escape", description: "Move the whole party again", hidden: true, handler: selectParty }]);

function onMove(positions: Record<string, ExploreCell>) {
  place(positions);
}

// ── Stepping into a room ────────────────────────────────────────────────────
const lead = computed(() => {
  const picked = tokens.value.find((t) => t.instance_id === selectedId.value && t.position);
  const token = picked ?? tokens.value.find((t) => t.position);
  return token?.position ? { position: token.position, footprint: token.footprint ?? 1 } : null;
});
const enteringRoomId = computed(() => roomBeingEntered(lead.value, roomIndex.value, currentRoomId.value));
const enteringRoom = computed(() => rooms.value.find((r) => r.id === enteringRoomId.value) ?? null);

// "Not yet" holds for as long as the lead stays in that room's cells.
const notYetRoomId = ref<string | null>(null);
watch(enteringRoomId, (id) => {
  if (id !== notYetRoomId.value) notYetRoomId.value = null;
});
const askRoom = computed(() =>
  enteringRoom.value && !isExplored(enteringRoom.value.id) && notYetRoomId.value !== enteringRoom.value.id ? enteringRoom.value : null,
);

async function goTo(roomId: string): Promise<boolean> {
  const room = rooms.value.find((r) => r.id === roomId);
  if (!room) return false;
  return moveParty({ roomId, roomName: room.name, currentRoomId: currentRoomId.value, reachable: reachable.value });
}
function revealRoom(roomId: string) {
  void goTo(roomId);
}
function notYet(roomId: string) {
  notYetRoomId.value = roomId;
}
// A room the party has been in before needs no asking: the lead walking into it is the party being there.
watch(enteringRoomId, (id) => {
  if (id && isExplored(id)) void goTo(id);
});

// The list moves the party to a room and stands them in it, so the map and the room agree.
async function goToRoom(roomId: string) {
  const moved = await goTo(roomId);
  if (!moved || !roomCells.value || !party.value) return;
  place(seedPartyPositions(party.value, roomCells.value, roomIds.value, roomId));
}

// ── What the map paints ─────────────────────────────────────────────────────
const roomLabels = computed(() =>
  rooms.value.flatMap((r) => {
    const cells = roomCells.value?.get(r.id);
    return cells ? [{ id: r.id, name: r.name, cells }] : [];
  }),
);
const shadedCells = computed(() => rooms.value.filter((r) => !isExplored(r.id)).flatMap((r) => roomCells.value?.get(r.id) ?? []));
const enteringCells = computed(() => (enteringRoomId.value ? (roomCells.value?.get(enteringRoomId.value) ?? []) : []));

const roomRows = computed(() =>
  rooms.value.map((r): { id: string; name: string; state: RoomExploreState } => ({
    id: r.id,
    name: r.name,
    state: r.id === enteringRoomId.value ? "entering" : isExplored(r.id) ? "explored" : "hidden",
  })),
);

const view = ref<PlayViewState>({ ...DEFAULT_PLAY_VIEW, showFog: false });
const VIEW_ENTRIES = ["showGrid", "showZones", "showTokens"] as const;
const map = ref<InstanceType<typeof ExploreMap> | null>(null);

// ── The plan, for a site whose grid is not lined up yet ─────────────────────
const mapStack = computed(() => buildMapStack(site.value));
const dmFogPlan = computed(() =>
  buildDmFogPlan(
    regions.value,
    rooms.value,
    isExplored,
    (id) => stateOf(id, "cleared")?.value === true,
    (id) => stateOf(id, "looted")?.value === true,
  ),
);
const fogGlimpsedCells = computed(() => dmFogPlan.value.glimpsed.map((g) => g.cells));

// ── The room card ───────────────────────────────────────────────────────────
const cardRoom = computed(() => enteringRoom.value ?? currentRoom.value);
const cardRoomId = computed(() => cardRoom.value?.id ?? "");
const { data: cardLoot } = useLootPlacements({ locationId: cardRoomId });
const roomLoot = computed(() => cardLoot.value ?? []);

const beatSpaceIds = computed(() => [siteId.value, ...(cardRoom.value ? [cardRoom.value.id] : [])]);
const { data: stagedBeats } = useBeatsStagedAt(beatSpaceIds);
const currentBeat = computed(() => {
  const beats = stagedBeats.value ?? [];
  if (!beats.length) return null;
  // A beat staged in the room is more relevant than one at the site; the latest touch wins a tie.
  const atRoom = cardRoom.value ? beats.filter((b) => b.staged_at_location_id === cardRoom.value?.id) : [];
  const candidates = atRoom.length ? atRoom : beats.filter((b) => b.staged_at_location_id === siteId.value);
  return [...candidates].sort((a, b) => b.updated_at.localeCompare(a.updated_at))[0] ?? null;
});

// A trigger zone over the room the party is in can name a beat from anywhere in the quest graph (#868 S12/S13).
const dismissedTriggerRoomId = ref<string | null>(null);
watch(currentRoomId, () => {
  dismissedTriggerRoomId.value = null;
});
const triggerBeatId = computed(() => {
  const roomId = currentRoomId.value;
  const roomRegion = roomId ? regions.value.find((r) => r.region_role === "space" && r.space_location_id === roomId) : undefined;
  if (!roomRegion) return null;
  const roomCellSet = new Set(roomRegion.cells);
  const zone = regions.value.find(
    (r) => r.region_role === "zone" && r.zone_kind === "trigger" && !!r.zone_payload.beat_id && r.cells.some((c) => roomCellSet.has(c)),
  );
  return zone?.zone_payload.beat_id ?? null;
});
const { data: triggerBeat } = useQuestBeat(computed(() => triggerBeatId.value ?? ""));
const showTriggerPrompt = computed(() => !!triggerBeat.value && dismissedTriggerRoomId.value !== currentRoomId.value);
function advanceTriggerBeat() {
  const target = triggerBeat.value;
  if (!target) return;
  const to: RouteLocationRaw = questSurfaceReturnTo(target.quest_id, target.id, "run");
  void router.push(to);
}
function dismissTriggerPrompt() {
  dismissedTriggerRoomId.value = currentRoomId.value;
}

/** The table screen is a second window, for a screen the table looks at; it follows the party from there. */
function openTableScreen() {
  window.open(`/locations/${siteId.value}/table`, "_blank", "noopener,noreferrer");
}

// A fight starts where the party stands: in their room when they are in one, else at the site.
const { startFightAt, starting } = useStartFight();
function startFight() {
  const where = currentRoom.value ?? site.value;
  if (where) void startFightAt(where.id, `${where.name} fight`);
}

/** Back to the site's Map tab, where the way into exploring started. */
function backToAtlas() {
  locationsUi.locationsPaneMode = "map";
  void router.push(placeRoute(siteId.value));
}
</script>
