import { computed, ref, toValue, watch, type MaybeRefOrGetter, type Ref } from "vue";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { useEncounterLive, liveState } from "@/composables/encounters/useEncounterLive";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useToast } from "@/composables/useToast";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignStore } from "@/stores/campaign";
import { useAuthStore } from "@/stores/auth";
import { useHealPictureShape } from "@/composables/locations/useHealPictureShape";
import { roomCellIndex, roomsUnder, seatFromExploring } from "@/lib/locations/explore";
import { roomBattleCells } from "@/lib/locations/exploreSeating";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import { seedTokenPositions } from "@/lib/battlemap/roomBridge";
import { scatterInRoom as scatterInCells } from "@/lib/battlemap/scatter";
import { useLocationNames } from "@/composables/locations/useLocations";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import type { CellKey } from "@/types/dungeonMap.types";
import { gridFromRatio } from "@/lib/battlemap/imageGrid";
import { useFightMapSight } from "@/composables/encounters/useFightMapSight";
import { useAssertLocationState, useLocationStateForRooms } from "@/composables/locations/useLocationState";
import { zoneIdAt } from "@/lib/battlemap/darkness";
import { roomCellsAt } from "@/lib/battlemap/roomFog";
import { doorAt, effectiveDoors } from "@/lib/battlemap/doors";
import type { MoveTerrain } from "@/lib/battlemap/movement";
import { hasAnyMapLayer } from "@/lib/locations/mapStack";
import { isInteriorType } from "@/lib/locations/tiers";
import type { MagicalDarknessZone, RunCombatant } from "@/types/encounter.types";
import type { DarknessRadius, FogBrushKind, PlayMapMode } from "./playTypes";
import { footprintOf, placedCombatants, unplacedCombatants } from "./playRoster";

/**
 * Everything the Play map reads and writes that is not geometry: which combatants to draw, the
 * map memory and the party's sight, darkness and door mirrors with their pushes, and the seating of a fight in its room.
 * Geometry (pixels to cells) lives in PlayMap, which calls the cell-based actions below, so this
 * file needs no DOM.
 *
 * Who runs the fight (#1120): the DM's screen shares the runner's store; a follower window starts
 * with an empty store and follows the live row instead. The mode decides which, not the store.
 */
export function usePlayMapState(
  encounterId: Ref<string>,
  mode: MaybeRefOrGetter<PlayMapMode>,
  /** The map picture's natural size, once known: the grid sight is computed over (null until then). */
  imageSize: MaybeRefOrGetter<{ w: number; h: number } | null> = null,
) {
  const room = useEncounterRoom(encounterId);
  const { encounter, location: encounterLocation, mapLocation: location, surface, focusRoom, terrainZones, regions } = room;
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const auth = useAuthStore();
  const toast = useToast();
  const { isLive, liveStateLoaded, scheduleMapPush, moveToken } = useEncounterLive(encounterId, { follow: true });

  const following = computed(() => toValue(mode) === "follower");

  // Every run is a saved row (#1201), live or not, and both windows draw it: the server saves the runner's
  // commands into it, and every battle map, the players' included, writes token positions into it. The row
  // is read for the map's own sake, so a click in the runner reaches the tokens once the server has answered
  // (the runner's list shows it at once). Only the moment before the row is first read falls back to the store.
  const row = computed(() => (liveState.value?.encounter_id === encounterId.value ? liveState.value : null));
  const combatants = computed<RunCombatant[]>(() => {
    if (row.value) return row.value.combatants_live;
    return following.value ? [] : store.combatants;
  });
  const round = computed(() => (row.value ? row.value.current_round : store.round));
  // The row's turn indexes the initiative-sorted order, as on the player map.
  const activeInstanceId = computed(() => {
    if (!row.value) return following.value ? null : (store.activeCombatant?.instance_id ?? null);
    return sortCombatantsByInitiative(row.value.combatants_live)[row.value.active_combatant_index]?.instance_id ?? null;
  });
  const factions = computed(() => {
    if (!following.value) return store.factions;
    const own = encounter.value?.factions ?? [];
    return own.length ? own : [...DEFAULT_FACTIONS];
  });
  // A follower reads the monsters on the board itself (size and art); the runner's tab already holds them.
  const { data: followedMonsters } = useMonstersByIds(
    () => (following.value ? combatants.value.map((c) => c.monster_id) : []),
    { withArt: true },
  );
  const monsters = computed(() => (following.value ? [...followedMonsters.value.values()] : store.availableMonsters));

  const placed = computed(() => placedCombatants(combatants.value));
  const unplaced = computed(() => unplacedCombatants(combatants.value));

  function reportMoveFailure(error: unknown) {
    toast.error(toast.fromError(error, "Couldn't move that token."));
  }

  // A move goes straight to the row through the position function, which lets the DM move any token, live
  // or not. A position is not a command: the server's own saves keep the row's, and the runner's store takes
  // it from the row's next read.
  function moveCombatant(instanceId: string, position: { x: number; y: number }) {
    moveToken(instanceId, position).catch(reportMoveFailure);
  }

  // ── Fog of war ──────────────────────────────────────────────────────────
  // The fog is the map's memory (epic #1133): shared by exploring and every fight on this map, so a fight owns no
  // fog of its own. Only the DM's window writes; a follower reads.
  const canWrite = computed(() => !following.value);
  // The picture's shape is how the fight server knows where the map ends (#1202); only the DM's own window records it.
  useHealPictureShape({ place: () => surface.value?.mapLocation, enabled: () => canWrite.value && auth.isDM });

  function reportMemoryFailure(error: unknown) {
    toast.error(toast.fromError(error, "Couldn't save the fog."));
  }

  function paintFog(cells: Set<FogCellKey>, kind: Exclude<FogBrushKind, "room">) {
    if (!canWrite.value) return;
    // Only the squares that change: a stroke repaints the same squares many times a second, and each write is a request.
    if (kind === "reveal") {
      const fresh = [...cells].filter((k) => !memory.memory.value.has(k));
      memory.remember(fresh).catch(reportMemoryFailure);
    } else {
      const held = [...cells].filter((k) => memory.memory.value.has(k));
      memory.hide(held).catch(reportMemoryFailure);
    }
  }

  /**
   * The Fog tool's Room: reveals the whole traced room under a point with one click (#1125 frame 11). False when the
   * point is on no room.
   */
  function revealRoomAt(x: number, y: number): boolean {
    const s = surface.value;
    if (!s || !canWrite.value) return false;
    const cells = roomCellsAt(regions.value ?? [], s.calibration, { x, y });
    if (!cells) return false;
    paintFog(cells, "reveal");
    return true;
  }

  /** "Reveal all" can't enumerate an infinite grid, so it fills the cells the picture covers. */
  function revealAll(imageW: number, imageH: number) {
    const s = surface.value;
    if (!s || !canWrite.value) return;
    const cellsAcross = s.calibration.cells_per_image_width;
    if (!cellsAcross || imageH <= 0) return;
    const covered = gridFromRatio(cellsAcross, imageH / imageW);
    if (!covered) return;
    const next = new Set<FogCellKey>();
    for (let y = 0; y < covered.rows; y++) {
      for (let x = 0; x < covered.cols; x++) next.add(`${x},${y}`);
    }
    memory.replaceWith(next).catch(reportMemoryFailure);
  }

  function hideAll() {
    if (!canWrite.value) return;
    memory.forgetAll().catch(reportMemoryFailure);
  }

  // ── Magical darkness ────────────────────────────────────────────────────
  const darknessZones = ref<MagicalDarknessZone[]>([]);
  watch(
    () => liveState.value?.magical_darkness,
    (zones) => {
      if (zones) darknessZones.value = zones;
    },
    { immediate: true },
  );

  /** A click inside a sphere removes the topmost one there; elsewhere it places one centred on the click. */
  function toggleDarknessAt(x: number, y: number, radius: DarknessRadius) {
    const hit = zoneIdAt(darknessZones.value, x, y);
    darknessZones.value =
      hit === null
        ? [...darknessZones.value, { id: crypto.randomUUID(), x, y, radius }]
        : darknessZones.value.filter((z) => z.id !== hit);
    if (row.value) scheduleMapPush({ magicalDarkness: darknessZones.value });
  }

  // ── The map's memory, doors and what the party sees ─────────────────────────
  // Shared with the solo table's map. Here every placed token looks, and only the DM's own window writes memory.
  const { memory, doorStates, setDoor, viewers, sight, occluders } = useFightMapSight({
    surface: () => surface.value,
    imageSize,
    zones: darknessZones,
    tokens: placed,
    mayRemember: canWrite,
  });

  // ── Doors ───────────────────────────────────────────────────────────────

  function doorIdAt(x: number, y: number): string | null {
    const drawn = surface.value?.live?.doors;
    return drawn ? doorAt(effectiveDoors(drawn, doorStates.value), x, y) : null;
  }

  /** Flips the door at a point; false when none is there. */
  function toggleDoorAt(x: number, y: number): boolean {
    const drawn = surface.value?.live?.doors;
    const id = doorIdAt(x, y);
    if (!drawn || id === null || !canWrite.value) return false;
    const now = effectiveDoors(drawn, doorStates.value).find((d) => d.id === id);
    if (!now) return false;
    setDoor(id, !now.open).catch((error: unknown) => toast.error(toast.fromError(error, "Couldn't save the door.")));
    return true;
  }

  // ── Seeding ─────────────────────────────────────────────────────────────
  // Entering combat seats the party in the room they already occupy (frame 13/16). Token placement is
  // idempotent (it only fills combatants with no position). The fog is not seeded: what the party sees comes
  // from their senses, and the map's memory is the map's. Tokens are placed from the live row, never the
  // runner's store, which does not hear players' moves.
  function seedRoomIfNeeded() {
    const s = surface.value;
    const seated = row.value;
    if (!s || !seated) return;

    // A fight started while exploring this site stands everyone where they were (#1125 decision 9); whoever has no
    // explored square, or the room has to seat, falls through to the room's cells below.
    const walked = seatFromExploring(seated.combatants_live, campaign.activeCampaign?.explore_party ?? null, s.mapLocation.id, s.calibration.cells_per_image_width);
    const seeded = seedTokenPositions(walked, s.focusCells);
    seeded.forEach((c, i) => {
      if (c.position && !seated.combatants_live[i]?.position) moveToken(c.instance_id, c.position).catch(reportMoveFailure);
    });
  }

  // A combatant spawned mid-fight joins the roster without a place; the count changing seats it like the rest.
  watch(
    () => [isLive.value, surface.value, row.value?.combatants_live.length, following.value] as const,
    ([live, , , follower]) => {
      if (live && !follower) seedRoomIfNeeded();
    },
    { immediate: true },
  );

  // ── The rooms the party enters ───────────────────────────────────────────
  // Entering a room marks it Explored (decision 7). Once per room per session, never undone, DM window only.
  const roomIndex = computed(() => (surface.value ? roomCellIndex(regions.value ?? [], surface.value.calibration) : new Map<CellKey, string>()));
  const tracedRoomIds = computed(() => [...new Set(roomIndex.value.values())]);
  const roomFacts = useLocationStateForRooms(tracedRoomIds);
  const assertState = useAssertLocationState();
  const markedExplored = new Set<string>();
  watch(
    () => [roomsUnder(placed.value.filter((c) => c.type === "player"), roomIndex.value), roomFacts.isSuccess.value] as const,
    ([entered, loaded]) => {
      if (!canWrite.value || !loaded) return;
      for (const id of entered) {
        if (markedExplored.has(id) || roomFacts.stateOf(id, "explored")?.value) continue;
        markedExplored.add(id);
        assertState.mutate({ location_id: id, fact: "explored", value: true, note: "entered in a fight" });
      }
    },
    { immediate: true },
  );

  /** What a move crosses: the difficult zones the map draws, and the walls and closed doors a big token can wedge in. */
  const moveTerrain = computed<MoveTerrain>(() => {
    return {
      difficult: new Set(terrainZones.value.flatMap((z) => z.battleCells)),
      walls: occluders.value ? occluders.value.segments : [],
    };
  });

  // ── Scatter in a room ───────────────────────────────────────────────────
  const roomNames = useLocationNames(tracedRoomIds);
  const cellsByRoom = computed(() => (surface.value ? roomBattleCells(regions.value ?? [], surface.value.calibration) : new Map<string, CellKey[]>()));
  /** The rooms this map has cells for, the room the fight is anchored in first. */
  const rooms = computed<{ id: string; name: string }[]>(() => {
    const focus = surface.value?.focusRoomId ?? null;
    return [...cellsByRoom.value.keys()]
      .map((id) => ({ id, name: roomNames.value.get(id) ?? "Unnamed room" }))
      .sort((a, b) => Number(b.id === focus) - Number(a.id === focus));
  });

  /**
   * Places every foe the map has no square for inside a room, clear of everyone already on the map. Whoever the room
   * has no space for stays in the tray. A placement is not a move: it spends no movement and has nothing to undo.
   */
  function scatterInRoom(roomId: string) {
    const cells = cellsByRoom.value.get(roomId);
    if (!cells || !canWrite.value) return;
    const spots = scatterInCells(combatants.value, cells, { footprintOf: (c) => footprintOf(c, monsters.value) });
    for (const [instanceId, position] of spots) moveCombatant(instanceId, position);
  }

  /** Why there is no map to draw yet, or null when there is one. */
  const loadingState = computed(() => {
    if (!encounter.value) return "Loading encounter…";
    if (!encounter.value.location_id) {
      return "This encounter is not linked to a location. Set a location with a calibrated map to use the battle view.";
    }
    const own = encounterLocation.value;
    if (!own) return "Loading location…";
    if (!surface.value) {
      // The map stack first: an interior space can have its own uncalibrated Picture or Drawing even
      // while its site's plan is also uncalibrated, and that needs "calibrate", not "no map".
      if (isInteriorType(own.location_type)) {
        return hasAnyMapLayer(own)
          ? "This room's map has no grid yet. Line up its grid from the room's Map tab in the Atlas."
          : "This room has no map of its own, and its site's map has no grid either. Line up the site's grid in Edit map first.";
      }
      return hasAnyMapLayer(own)
        ? "This map has no grid yet. Line up its grid from the place's Map tab in the Atlas."
        : "The linked location has no map. Upload or bake a map for this location first.";
    }
    if (following.value && liveStateLoaded.value && !isLive.value) {
      return "This window follows the live fight. Go live in the runner and the tokens appear here.";
    }
    return null;
  });

  return {
    surface,
    location,
    focusRoom,
    terrainZones,
    moveTerrain,
    isLive,
    following,
    combatants,
    round,
    placed,
    unplaced,
    activeInstanceId,
    factions,
    monsters,
    moveCombatant,
    rooms,
    scatterInRoom,
    memory: memory.memory,
    sight,
    viewers,
    paintFog,
    revealRoomAt,
    revealAll,
    hideAll,
    darknessZones,
    toggleDarknessAt,
    doorStates,
    doorIdAt,
    toggleDoorAt,
    loadingState,
  };
}
