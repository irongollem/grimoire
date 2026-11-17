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
import { snapAnchor, type Cell } from "@/lib/battlemap/movement";
import { occludersOf } from "@/lib/battlemap/occlusion";
import { partyVisibleCombatants, shownCells } from "@/lib/battlemap/partySight";
import { readPictureFloor, voidAround } from "@/lib/battlemap/pictureFloor";
import { soloSeating } from "@/lib/battlemap/soloSeating";
import { combatantAt, isFoeOf, reachZones, targetOf, walkVerdict } from "@/lib/table/fight/mapRules";
import { isHostileTo, reachable, type ReachInput } from "@/rules/fight/terrain/reach";
import type { MonsterSize } from "@/types/monster.types";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useCampaignStore } from "@/stores/campaign";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { RunCombatant } from "@/types/encounter.types";

/** The size a footprint in squares stands for, for the rules on moving round other creatures. */
function sizeNameOf(footprint: number): MonsterSize {
  if (footprint < 1) return "tiny";
  if (footprint >= 4) return "gargantuan";
  return footprint >= 3 ? "huge" : footprint >= 2 ? "large" : "medium";
}

/** Nothing drawn that stops a walk: no wall, no door, no rock. */
const unwalled = (occluders: { segments: readonly unknown[]; solid: ReadonlySet<string> } | null): boolean =>
  occluders === null || (occluders.segments.length === 0 && occluders.solid.size === 0);

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
  /** The feet a Dash would add to this turn: the character's speed while the Action is unspent, nothing after. */
  dashFeet: MaybeRefOrGetter<number>;
  arming: MaybeRefOrGetter<boolean>;
  onMoved: (feet: number) => void;
  /**
   * Called with the path before the token moves: the creatures whose reach it leaves strike first. Resolves to
   * whether the character is still up to make the walk.
   */
  beforeLeaving: (path: ReadonlyArray<{ x: number; y: number }>) => Promise<boolean>;
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

  // Where the character can get to this turn, by the same search the creatures move by: round walls, closed doors
  // and other creatures, at the price of each square. It runs as far as a Dash would reach, so the map can show
  // both what the turn can walk now and what it could with the Action spent on moving.
  const leftFeet = computed(() => Math.max(0, toValue(options.speedFeet) - toValue(options.movedFeet)));
  const reach = computed(() => {
    const me = played.value;
    const live = surface.value?.live;
    if (!me?.position || !toValue(options.canMove)) return null;
    const occluders = live ? occludersOf(live, doorStates.value) : null;
    const g = grid.value;
    const terrain: ReachInput["terrain"] = {
      difficult: new Set(terrainZones.value.flatMap((z) => z.battleCells)),
      blocking: occluders ? occluders.segments : [],
      // A map with no walls drawn has only its picture to go by: what the picture shows no ground on is not walked.
      solid: unwalled(occluders) && g && pictureFloor.value ? voidAround(pictureFloor.value, g) : occluders ? occluders.solid : new Set<string>(),
      // A picture whose height is not read yet has rows as far as anyone stands.
      bounds: g ? { minX: 0, minY: 0, maxX: g.cols - 1, maxY: g.rows - 1 } : { minX: 0, minY: 0, maxX: 199, maxY: 199 },
    };
    return reachable({
      mover: { anchor: me.position, footprint: sizeOf(me), size: sizeNameOf(sizeOf(me)) },
      budgetFeet: leftFeet.value + toValue(options.dashFeet),
      terrain,
      others: combatants.value
        .filter((c) => c.instance_id !== me.instance_id && c.position && c.hp > 0)
        .map((c) => ({ anchor: c.position as Cell, footprint: sizeOf(c), size: sizeNameOf(sizeOf(c)), hostile: isHostileTo(me, c), incapacitated: false })),
      ruleset: store.ruleset,
    });
  });
  /** The squares to light up: only while walking is what the pointer does. */
  const reachCells = computed(() => (reach.value && tool.value === "move" && !toValue(options.arming) ? reachZones(reach.value.cells.values(), leftFeet.value) : []));

  /** Walks the played token to `to` if the turn allows it; says why when it does not. */
  function walkTo(to: Cell): void {
    const me = played.value;
    if (!me?.position) return;
    const from = me.position;
    if (Math.floor(to.x) === Math.floor(from.x) && Math.floor(to.y) === Math.floor(from.y)) return;
    const found = reach.value?.cells.get(`${Math.floor(to.x)},${Math.floor(to.y)}`);
    const verdict = walkVerdict({ canMove: toValue(options.canMove), leftFeet: leftFeet.value, feet: found ? found.feet : null });
    if (!verdict.ok || !found) {
      refusal.value = verdict.ok ? null : verdict.reason;
      return;
    }
    refusal.value = null;
    const id = me.instance_id;
    const { cell, feet, path } = found;
    // The square first, the feet after it has landed. Sent side by side, the fight's own save (which the feet are a
    // command to) could load the row before the new square was on it and write the old one back: the token shot
    // home and the turn was still charged. A move that fails charges nothing.
    // Opportunity attacks come right before the character leaves a creature's reach (PHB 2014 "Opportunity
    // Attacks"): the strikes are resolved first, and a character struck down does not make the walk.
    options
      .beforeLeaving(path)
      .then((standing) => {
        if (!standing) {
          refusal.value = "You are struck down before you get away.";
          return false;
        }
        return moveToken(id, cell).then(() => true);
      })
      .then((moved) => {
        if (!moved) return;
        // Before the first round nothing is counted against a turn.
        if (store.started) store.recordMove(id, from, feet);
        options.onMoved(feet);
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
    reachCells,
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
