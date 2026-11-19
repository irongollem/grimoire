import { computed, ref, toValue, watch, type MaybeRefOrGetter } from "vue";
import { useLocationBattleSurface } from "@/composables/encounters/useEncounterRoom";
import { usePartySight } from "@/composables/encounters/usePartySight";
import { useAllLocations, useLocations } from "@/composables/locations/useLocations";
import { usePartyTokenSizes } from "@/composables/locations/useExploreParty";
import { useDoorStateForSite, useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { useMapDoors } from "@/composables/locations/useMapDoors";
import { useMapMemory } from "@/composables/locations/useMapMemory";
import { useRememberSight } from "@/composables/locations/useRememberSight";
import { useSiteDoors } from "@/composables/locations/useSiteDoors";
import { shownCells } from "@/lib/battlemap/partySight";
import {
  entranceBattleCells,
  exploreTokens,
  roomBattleCells,
  roomCellIndex,
  roomUnder,
  seedPartyAtCentre,
  seedPartyAtEntrance,
  seedPartyPositions,
  type ExploreFrame,
} from "@/lib/locations/explore";
import { buildMapStack, hasAnyMapLayer } from "@/lib/locations/mapStack";
import { buildDmFogPlan } from "@/lib/locations/siteFog";
import { partyRoomInSite, siteReachability } from "@/lib/locations/siteRun";
import { bindableSpaces, isInteriorType } from "@/lib/locations/tiers";
import { compareSiblings } from "@/lib/locations/tree";
import { goTarget, siteOf } from "@/lib/table/solo/placeMap";
import type { ExploreCell } from "@/rules/explore/explorePositions";
import { useCampaignStore } from "@/stores/campaign";
import type { CellKey } from "@/types/dungeonMap.types";
import type { Location } from "@/types/location.types";
import type { PartyMember } from "@/types/party.types";

/**
 * The map above the story while the party is exploring (Solo Table frame 03): the map the story's place is on, the
 * played character's token on it, and what that character has seen. The story moves the party, so nothing here writes
 * where the party is (`campaigns.explore_party`, `current_location_id`) or the doors. What the character sees is
 * remembered in the map's memory, as on the DM's exploring screen: a place seen once stays seen.
 */
export function useSoloPlaceMap(input: {
  placeId: MaybeRefOrGetter<string | null>;
  member: MaybeRefOrGetter<PartyMember>;
  busy: MaybeRefOrGetter<boolean>;
  onGo: (place: { id: string; name: string }) => void;
}) {
  const campaign = useCampaignStore();

  // ── Which map: the place's own, else the nearest ancestor's ───────────────
  const { data: all } = useAllLocations();
  const byId = computed(() => new Map((all.value ?? []).map((l) => [l.id, l])));
  /** Null until the places have loaded: the page must not hide the box on a guess. */
  const siteId = computed(() => (all.value ? siteOf(toValue(input.placeId), byId.value) : null));
  const hasMap = computed(() => (all.value ? siteId.value !== null : null));
  const siteRef = computed(() => siteId.value ?? "");
  const site = computed(() => (siteId.value ? (byId.value.get(siteId.value) ?? null) : null));

  // ── The site's rooms, doors and where the party stands in them ────────────
  const { data: children } = useLocations(computed<string | null>(() => siteRef.value));
  const rooms = computed<Location[]>(() => (children.value ?? []).filter((l) => isInteriorType(l.location_type)).sort(compareSiblings));
  const roomIds = computed(() => rooms.value.map((r) => r.id));
  const spaces = computed(() => bindableSpaces(children.value ?? []));
  const { surface, regions: regionRows } = useLocationBattleSurface(siteRef);
  const regions = computed(() => regionRows.value ?? []);
  const doorsQuery = useSiteDoors(roomIds);
  const doors = computed(() => doorsQuery.data.value ?? []);
  const { stateOf: doorStateOf } = useDoorStateForSite(siteRef);
  const { stateOf } = useLocationStateForRooms(roomIds);

  const currentRoomId = computed(() => partyRoomInSite(toValue(input.placeId), roomIds.value));
  const reachable = computed(() => {
    const unlocked = new Set(doors.value.filter((d) => doorStateOf(d.id, "unlocked")?.value === true).map((d) => d.id));
    return siteReachability(currentRoomId.value, doors.value, unlocked);
  });

  /** A click on a room: the story is told only when the rules allow it, and the map itself never moves the party. */
  function chooseRoom(roomId: string | null) {
    const target = goTarget({ busy: toValue(input.busy), currentRoomId: currentRoomId.value, clickedRoomId: roomId, reachable: reachable.value });
    const room = target === null ? undefined : rooms.value.find((r) => r.id === target);
    if (room) input.onGo({ id: room.id, name: room.name });
  }

  // ── The character's token: kept here, never written ───────────────────────
  const member = computed(() => toValue(input.member));
  const sizeOf = usePartyTokenSizes(() => [member.value]);
  const frame = ref<ExploreFrame | null>(null);
  const roomCells = computed(() => (surface.value ? roomBattleCells(regions.value, surface.value.calibration) : null));
  const roomIndex = computed(() => (surface.value ? roomCellIndex(regions.value, surface.value.calibration) : new Map<CellKey, string>()));
  const entranceCells = computed(() => (surface.value ? entranceBattleCells(regions.value, surface.value.calibration) : []));
  const positions = ref<Record<string, ExploreCell>>({});
  let seatedFor: string | null = null;

  // The token is seated again whenever the story's place changes: in the room the party is in, else at an Entrance
  // zone, else in the first room, else the middle of the picture. Waits until the map has what it needs.
  watch(
    [siteRef, currentRoomId, roomCells, entranceCells, frame, () => member.value.id],
    () => {
      const cells = roomCells.value;
      if (!cells || siteRef.value === "") return;
      const key = `${siteRef.value}|${currentRoomId.value ?? ""}|${member.value.id}`;
      if (seatedFor === key) return;
      const one = [member.value];
      const inRoom = currentRoomId.value !== null && cells.has(currentRoomId.value) ? seedPartyPositions(one, cells, roomIds.value, currentRoomId.value) : {};
      const entrance = Object.keys(inRoom).length === 0 ? seedPartyAtEntrance(one, entranceCells.value, sizeOf) : {};
      const firstRoom = Object.keys(inRoom).length + Object.keys(entrance).length === 0 ? seedPartyPositions(one, cells, roomIds.value, null) : {};
      const seated = { ...inRoom, ...entrance, ...firstRoom };
      const centred = Object.keys(seated).length === 0 && frame.value ? seedPartyAtCentre(one, frame.value, sizeOf) : {};
      const next = { ...seated, ...centred };
      // Until something seats it, the old place's square must not stand in the new place.
      positions.value = next;
      if (Object.keys(next).length > 0) seatedFor = key;
    },
    { immediate: true },
  );

  const tokens = computed(() => (siteRef.value ? exploreTokens([member.value], { site_id: siteRef.value, positions: positions.value }, siteRef.value, sizeOf) : []));
  const selectedId = computed(() => tokens.value[0]?.instance_id ?? null);

  /** The map handed a move: inside the current room (or open ground) the token goes there; another room is the story's to take. */
  function onMove(moved: Record<string, ExploreCell>) {
    if (toValue(input.busy)) return;
    const to = Object.hasOwn(moved, member.value.id) ? moved[member.value.id] : undefined;
    if (!to) return;
    const footprint = tokens.value[0]?.footprint ?? 1;
    const under = roomUnder(to, footprint, roomIndex.value);
    if (under !== null && under !== currentRoomId.value) {
      chooseRoom(under);
      return;
    }
    positions.value = { ...positions.value, [member.value.id]: to };
  }

  // ── What the character has seen: memory plus what is in view now ──────────
  const grid = computed(() => (frame.value ? { cols: Math.ceil(frame.value.across), rows: Math.ceil(frame.value.down) } : null));
  const { doorStates } = useMapDoors(() => campaign.activeCampaignId, () => siteId.value);
  const { sight } = usePartySight({ live: () => surface.value?.live ?? null, doorStates, zones: [], tokens, grid });
  const mapMemory = useMapMemory(() => campaign.activeCampaignId, () => siteId.value);
  useRememberSight({ memory: mapMemory, sight, enabled: () => !!campaign.activeCampaignId && siteId.value !== null });
  const fogMask = computed(() => shownCells(mapMemory.memory.value, sight.value));

  const roomLabels = computed(() =>
    rooms.value.flatMap((r) => {
      const cells = roomCells.value?.get(r.id);
      return cells ? [{ id: r.id, name: r.name, cells }] : [];
    }),
  );

  // ── The plan, for a site whose grid is not lined up yet ───────────────────
  const planShown = computed(() => !surface.value && site.value !== null && hasAnyMapLayer(site.value));
  const mapStack = computed(() => buildMapStack(site.value));
  const fogGlimpsed = computed(
    () =>
      buildDmFogPlan(
        regions.value,
        rooms.value,
        (id) => stateOf(id, "explored")?.value === true,
        (id) => stateOf(id, "cleared")?.value === true,
        (id) => stateOf(id, "looted")?.value === true,
      ).glimpsed,
  );

  return {
    hasMap,
    site,
    surface,
    planShown,
    mapStack,
    regions,
    spaces,
    currentRoomId,
    reachable,
    fogGlimpsed,
    tokens,
    selectedId,
    roomLabels,
    fogMask,
    sight,
    doorStates,
    frame,
    onMove,
    chooseRoom,
  };
}
