import { computed, ref, shallowRef, toRef, toValue, watch, type MaybeRefOrGetter } from "vue";
import { pointerToCell } from "@/components/player/playerMapMove";
import type { PlayTool } from "@/components/encounters/play/playTypes";
import { footprintOf } from "@/components/encounters/play/playRoster";
import { liveState, useEncounterLive } from "@/composables/encounters/useEncounterLive";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import { usePartySight } from "@/composables/encounters/usePartySight";
import { useMapDoors } from "@/composables/locations/useMapDoors";
import { useMapMemory } from "@/composables/locations/useMapMemory";
import { useRememberSight } from "@/composables/locations/useRememberSight";
import { useToast } from "@/composables/useToast";
import { cellSizeInDisplay, gridLinePositions, gridOriginInDisplay } from "@/lib/battlemap/battleMapGeometry";
import { imageGrid, type MapGrid } from "@/lib/battlemap/imageGrid";
import { NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { measureFeet, snapToSquareMiddle, type MeasurePoint } from "@/lib/battlemap/measure";
import { OPEN_GROUND, planMove, snapAnchor, type Cell, type MoveTerrain } from "@/lib/battlemap/movement";
import { occludersOf } from "@/lib/battlemap/occlusion";
import { partyVisibleCombatants, shownCells } from "@/lib/battlemap/partySight";
import { readPictureFloor } from "@/lib/battlemap/pictureFloor";
import { soloSeating } from "@/lib/battlemap/soloSeating";
import { combatantAt, isFoeOf, moveAllowed, targetOf } from "@/lib/table/fight/mapRules";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignStore } from "@/stores/campaign";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";

/** How far a press may travel and still be a tap (not a pan). */
const TAP_SLOP_PX = 8;

/**
 * The state of the played character's map (#1021, Solo Table canvas, frames 12 and 13): the map as that character
 * sees it, and the one thing they may do on it, walk their own token. The component draws; this holds what it reads
 * and writes. Nothing here is a Dungeon Master's tool: no fog brush, darkness, drawing, ping or door.
 */
export function useSoloFightMap(options: {
  encounterId: MaybeRefOrGetter<string>;
  playedInstanceId: MaybeRefOrGetter<string>;
  canMove: MaybeRefOrGetter<boolean>;
  speedFeet: MaybeRefOrGetter<number>;
  movedFeet: MaybeRefOrGetter<number>;
  arming: MaybeRefOrGetter<boolean>;
  onMoved: (feet: number) => void;
  onTarget: (instanceId: string) => void;
}) {
  const store = useEncounterRunStore();
  const campaign = useCampaignStore();
  const toast = useToast();
  const encounterId = computed(() => toValue(options.encounterId));
  const playedId = computed(() => toValue(options.playedInstanceId));

  const room = useEncounterRoom(encounterId);
  const { surface, terrainZones } = room;
  // The host already follows this fight's row; the position writer is the same one the Dungeon Master's screen uses.
  const { moveToken } = useEncounterLive(encounterId, { follow: true });

  const canvas = useMapCanvas();
  const { imageNaturalW, imageNaturalH, imageReady, panX, panY, scale, hostW, hostH } = canvas;

  // ── The fight on the map ─────────────────────────────────────────────────────────────────────────────────────
  const row = computed(() => (liveState.value?.encounter_id === encounterId.value ? liveState.value : null));
  const combatants = computed<RunCombatant[]>(() => (row.value ? row.value.combatants_live : store.combatants));
  const played = computed(() => combatants.value.find((c) => c.instance_id === playedId.value) ?? null);
  const monsters = computed(() => store.availableMonsters);
  const sizeOf = (c: RunCombatant) => footprintOf(c, monsters.value);

  // ── The picture's grid, sight and memory ──────────────────────────────────────────────────────────────────────
  const grid = computed<MapGrid | null>(() =>
    imageGrid(surface.value?.calibration.cells_per_image_width, imageReady.value ? { w: imageNaturalW.value, h: imageNaturalH.value } : null),
  );
  const zones = computed<readonly DarknessZone[]>(() => (row.value ? row.value.magical_darkness : NO_ZONES));
  const { doorStates } = useMapDoors(
    () => campaign.activeCampaign?.id ?? null,
    () => surface.value?.mapLocation.id ?? null,
  );
  // Only the played character looks: the player sees what their character sees, nothing of the rest of the party.
  const { viewers, sight } = usePartySight({
    live: () => surface.value?.live ?? null,
    doorStates,
    zones,
    tokens: () => combatants.value.filter((c) => c.position),
    grid,
    onlyInstanceId: playedId,
  });
  const memory = useMapMemory(
    () => campaign.activeCampaign?.id ?? null,
    () => surface.value?.mapLocation.id ?? null,
  );
  // What the character has seen stays on the map for the next fight or room, as for a Dungeon Master's party.
  useRememberSight({ memory, sight, enabled: () => !!campaign.activeCampaign?.id && !!surface.value?.mapLocation.id });
  const shown = computed(() => shownCells(memory.memory.value, sight.value));
  const tokens = computed<RunCombatant[]>(() => partyVisibleCombatants(combatants.value, sight.value, playedId.value));

  // ── Seating: everyone is stood on the map as the fight opens ──────────────────────────────────────────────────
  // The picture's ground is read once per picture and grid; `undefined` while it is being read, null when it
  // could not be. Only a map with no traced room to seat in needs it.
  const pictureFloor = shallowRef<Set<CellKey> | null | undefined>(undefined);
  watch(
    () => [surface.value?.imageUrl, surface.value?.focusCells.length, grid.value?.cols, grid.value?.rows] as const,
    async ([url, roomCells], _old, onCleanup) => {
      let stale = false;
      onCleanup(() => (stale = true));
      pictureFloor.value = undefined;
      const g = grid.value;
      if (!g || roomCells === undefined) return;
      const read = roomCells > 0 || !url ? null : await readPictureFloor(url, g);
      if (!stale) pictureFloor.value = read;
    },
    { immediate: true },
  );
  function reportMoveFailure(error: unknown) {
    toast.error(toast.fromError(error, "Couldn't move that token."));
  }
  watch(
    () => [surface.value, grid.value, pictureFloor.value, row.value?.combatants_live.length] as const,
    ([s, g, floor]) => {
      const seated = row.value;
      if (!s || !seated || floor === undefined) return;
      const spots = soloSeating(seated.combatants_live, { focusCells: s.focusCells, grid: g, floor }, { footprintOf: sizeOf });
      for (const [instanceId, position] of spots) moveToken(instanceId, position).catch(reportMoveFailure);
    },
    { immediate: true },
  );

  // ── Geometry ──────────────────────────────────────────────────────────────────────────────────────────────────
  const image = computed(() => (surface.value ? { url: surface.value.imageUrl, calibration: surface.value.calibration } : null));
  const cellPx = computed(() =>
    image.value
      ? cellSizeInDisplay({ imageNaturalWidth: imageNaturalW.value, cellsPerImageWidth: image.value.calibration.cells_per_image_width, scale: scale.value })
      : 0,
  );
  const gridOrigin = computed(() =>
    image.value
      ? gridOriginInDisplay({
          panX: panX.value,
          panY: panY.value,
          scale: scale.value,
          imageNaturalWidth: imageNaturalW.value,
          imageNaturalHeight: imageNaturalH.value,
          originXPct: image.value.calibration.origin_x_pct,
          originYPct: image.value.calibration.origin_y_pct,
        })
      : { x: 0, y: 0 },
  );
  const gridVerticals = computed(() => (cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : []));
  const gridHorizontals = computed(() => (cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : []));
  const gridStrokeOpacity = computed(() => image.value?.calibration.grid_opacity ?? DEFAULT_GRID_OPACITY);

  // ── Moving: drag your token, or pick it and tap a square ──────────────────────────────────────────────────────
  const tool = ref<PlayTool>("move");
  const picked = ref(false);
  const refusal = ref<string | null>(null);
  const draggable = computed(() => (toValue(options.canMove) ? new Set([playedId.value]) : new Set<string>()));
  const pickedSet = computed<ReadonlySet<string> | null>(() => (picked.value ? new Set([playedId.value]) : null));

  const moveTerrain = computed<MoveTerrain>(() => {
    const live = surface.value?.live;
    return live
      ? { difficult: new Set(terrainZones.value.flatMap((z) => z.battleCells)), walls: occludersOf(live, doorStates.value).segments }
      : OPEN_GROUND;
  });

  /** Walks the played token to `to` if the turn allows it; says why when it does not. */
  function walkTo(to: Cell): void {
    const me = played.value;
    if (!me?.position) return;
    const plan = planMove({ from: me.position, to, footprint: sizeOf(me), terrain: moveTerrain.value });
    if (plan.steps.length === 0) return;
    const verdict = moveAllowed({ canMove: toValue(options.canMove), speedFeet: toValue(options.speedFeet), movedFeet: toValue(options.movedFeet), feet: plan.feet });
    if (!verdict.ok) {
      refusal.value = verdict.reason;
      return;
    }
    refusal.value = null;
    const id = me.instance_id;
    // The square first, the feet after it has landed. Sent side by side, the fight's own save (which the feet are a
    // command to) could load the row before the new square was on it and write the old one back: the token shot
    // home and the turn was still charged. A move that fails charges nothing.
    moveToken(id, plan.to)
      .then(() => {
        // Before the first round nothing is counted against a turn.
        if (store.started) store.recordMove(id, plan.from, plan.feet);
        options.onMoved(plan.feet);
      })
      .catch(reportMoveFailure);
  }

  function onTokenMoved(instanceId: string, position: Cell): void {
    if (instanceId === playedId.value) walkTo(position);
  }
  function onTokenSelect(instanceId: string): void {
    if (instanceId === playedId.value && toValue(options.canMove)) picked.value = !picked.value;
  }

  // ── Measuring: a line from one square to another, kept until the next one ────────────────────────────────────
  const measurePoints = ref<MeasurePoint[]>([]);
  const measureText = computed(() => (measurePoints.value.length > 1 ? `${measureFeet(measurePoints.value)} ft` : null));
  const measures = computed(() =>
    measurePoints.value.length > 1 ? [{ id: "mine", points: [...measurePoints.value], by: { id: "me", name: "You", color: "#e8d9a8" } }] : [],
  );
  watch(tool, () => {
    measurePoints.value = [];
    picked.value = false;
  });

  // ── The pointer: pan, tap a square, pick a target, measure ───────────────────────────────────────────────────
  let down: { x: number; y: number } | null = null;
  function cellAt(e: PointerEvent): Cell | null {
    const host = canvas.canvasHost.value;
    return host && cellPx.value > 0 ? pointerToCell(e, host.getBoundingClientRect(), gridOrigin.value, cellPx.value) : null;
  }

  function onHostDown(e: PointerEvent): void {
    down = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
    const at = cellAt(e);
    if (tool.value === "measure" && at && e.isPrimary) {
      measurePoints.value = [snapToSquareMiddle(at.x, at.y)];
      return;
    }
    canvas.startPan(e);
  }
  function onHostMove(e: PointerEvent): void {
    if (tool.value === "measure" && measurePoints.value.length > 0 && down) {
      const at = cellAt(e);
      if (at) measurePoints.value = [measurePoints.value[0], snapToSquareMiddle(at.x, at.y)];
      return;
    }
    canvas.continuePan(e);
  }
  function onHostUp(e: PointerEvent): void {
    const start = down;
    down = null;
    if (tool.value === "measure") return;
    canvas.endPan(e);
    if (!start || Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
    const at = cellAt(e);
    if (!at) return;
    if (toValue(options.arming)) {
      const clicked = combatantAt(at, tokens.value, sizeOf);
      const id = targetOf({ arming: true, clicked, played: played.value, factions: store.factions });
      if (id !== null) options.onTarget(id);
      return;
    }
    if (picked.value && tool.value === "move") {
      const me = played.value;
      if (me) walkTo(snapAnchor(at, sizeOf(me)));
      picked.value = false;
    }
  }
  function onHostCancel(e: PointerEvent): void {
    down = null;
    if (tool.value !== "measure") canvas.endPan(e);
  }

  /** The foes the armed map lights up: the ones a click would pick. */
  const foeIds = computed<ReadonlySet<string> | null>(() => {
    const me = played.value;
    if (!toValue(options.arming) || !me) return null;
    return new Set(tokens.value.filter((c) => isFoeOf(me, c, store.factions)).map((c) => c.instance_id));
  });

  const loadingState = computed(() => {
    if (!surface.value) return room.settled.value ? "This fight has no map to show." : "Loading the map…";
    return null;
  });

  return {
    ...canvas,
    surface,
    image,
    tokens,
    shown,
    sight,
    viewers,
    zones,
    doorStates,
    factions: toRef(store, "factions"),
    cellPx,
    gridOrigin,
    gridVerticals,
    gridHorizontals,
    gridStrokeOpacity,
    tool,
    refusal,
    draggable,
    pickedSet,
    foeIds,
    measures,
    measureText,
    loadingState,
    onTokenMoved,
    onTokenSelect,
    onHostDown,
    onHostMove,
    onHostUp,
    onHostCancel,
  };
}
