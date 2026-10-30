<template>
  <div class="map-root">
    <BattleMapToolbar
      v-model:tool="tool"
      v-model:brush-shape="brushShape"
      v-model:brush-size="brushSize"
      v-model:darkness-radius="darknessRadius"
      v-model:show-tokens="showTokens"
      v-model:show-zones="showZones"
      v-model:show-fog="showFog"
      v-model:show-grid="showGrid"
      v-model:preview-as-player="previewAsPlayer"
      :title="title"
      :caption="caption"
      :site-target="siteTarget"
      :site-tooltip="siteTooltip"
      :token-count="combatants.length"
      :calibration-from-publish="calibrationFromPublish"
      :scale-percent="Math.round(scale * 100)"
      :has-doors="surface?.live ? surface.live.doors.length > 0 : false"
      @reset-fog="resetFog"
      @reset-view="resetView"
    />

    <!-- Body -->
    <div
      ref="canvasHost"
      class="map-canvas-host"
      @wheel.prevent="onWheel"
      @pointerdown="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
      @pointerleave="onPointerUp"
    >
      <!-- Empty / error states -->
      <div v-if="loadingState" class="empty-state">{{ loadingState }}</div>

      <!-- Ground, water, grid, standing, top live layer (#1073), under room focus, tokens and fog. -->
      <BattleMapStack
        v-else-if="location && surface && imageReady"
        :host-w="hostW"
        :host-h="hostH"
        :image-url="surface.imageUrl"
        :stand-url="surface.standUrl"
        :stand-live-url="surface.standLiveUrl"
        :pan-x="panX"
        :pan-y="panY"
        :image-w="imageNaturalW * scale"
        :image-h="imageNaturalH * scale"
        :show-grid="showGrid"
        :grid-verticals="gridVerticals"
        :grid-horizontals="gridHorizontals"
        :grid-stroke-opacity="gridStrokeOpacity"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :live="surface.live"
        :zones="darknessZones"
        :door-states="doorStates"
      />

      <!-- Room focus layer: dims the plan outside the encounter's room and
           outlines it + its terrain zones (frame 13). Only when the map is a
           site plan the encounter is anchored to a room on — a plain
           location map has nothing to focus around. -->
      <BattleMapRoomFocusLayer
        v-if="surface?.focusRoomId && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :focus-cells="surface.focusCells"
        :zones="showZones ? terrainZones : []"
      />

      <!-- Token layer (DM-side: renders all combatants regardless of reveal_state) -->
      <BattleMapTokenLayer
        v-if="showTokens && location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="previewAsPlayer ? revealedCombatants(combatants, fogMask) : combatants"
        :hide-hidden="previewAsPlayer"
        :silhouette-unseen="previewAsPlayer"
        :factions="factions"
        :monsters="monsters"
        :npcs="store.availableNpcs"
        :active-instance-id="activeInstanceId"
        :draggable-instance-ids="tool === 'pan' ? null : emptyDragSet"
        :portrait-overrides="portraitOverrides"
        :figures="dollFigures"
        :on-position-change="onTokenMoved"
        :class="{ 'pointer-events-none': tool !== 'pan' }"
      />

      <!-- "As player" has to mean the whole player view, not just the fog.
           It used to darken the map and leave every token named, positioned
           and portrait-lit exactly as the DM sees them — so a DM checking
           whether their ambush was hidden was told "yes" by a preview that
           was not showing them a player's map at all. It now applies the
           same three rules the player's own view applies: fogged-out
           combatants dropped, `hidden` ones omitted, `unseen` ones reduced to
           a silhouette. Found by the #884 review pass. -->
      <!-- Fog layer: off by default in the DM's own view (frame 13 —
           "Fog (off)"); the fog toolbox's brushes still edit the mask
           regardless. "As player" preview forces it on and opaque, since
           that toggle exists specifically to show what a player sees. -->
      <BattleMapFogLayer
        v-if="(showFog || previewAsPlayer) && location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="fogMask"
        :opaque="previewAsPlayer"
      />

      <!-- Off-screen loader to read naturalWidth/Height -->
      <img
        v-if="surface?.imageUrl && !imageReady"
        :src="surface.imageUrl"
        class="hidden-loader"
        @load="onImageLoad"
      />
    </div>

    <BattleMapLegend :zones="terrainZones" />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { useEncounterRoom } from "@/composables/encounters/useEncounterRoom";
import { useCombatantMinis } from "@/composables/encounters/useCombatantMinis";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import { useEncounterRunStore } from "@/stores/encounterRun";
import { useEncounterLive, liveState } from "@/composables/encounters/useEncounterLive";
import { useMonstersByIds } from "@/composables/monsters/useMonstersByIds";
import { useToast } from "@/composables/useToast";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import { DEFAULT_FACTIONS } from "@/types/encounter.types";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapRoomFocusLayer from "@/components/encounters/BattleMapRoomFocusLayer.vue";
import BattleMapLegend from "@/components/encounters/BattleMapLegend.vue";
import BattleMapToolbar, {
  type BattleMapTool,
  type BattleMapBrushShape,
  type DarknessRadius,
} from "@/components/encounters/BattleMapToolbar.vue";
import { seedFogMask, seedTokenPositions } from "@/lib/battlemap/roomBridge";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battlemap/battleMapGeometry";
import {
  applyBrush,
  cellBrushCells,
  decodeFogMask,
  encodeFogMask,
  revealedCombatants,
  roundBrushCells,
  shouldSeedFog,
  type FogBrushMode,
  type FogCellKey,
} from "@/lib/battlemap/fogMask";
import { zoneIdAt } from "@/lib/battlemap/darkness";
import { doorEdgeAt, effectiveDoors, sameDoorStates, toggleDoor } from "@/lib/battlemap/doors";
import type { MapLiveDoorState } from "@/types/mapLive.types";
import type { MagicalDarknessZone, RunCombatant } from "@/types/encounter.types";
import { hasAnyMapLayer } from "@/lib/locations/mapStack";
import { isInteriorType } from "@/lib/locations/tiers";
import { placeRoute } from "@/lib/locations/placeRoute";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";

const route = useRoute();
const encounterId = computed(() => route.params.id as string);
// `location` here is the map-bearing location — the encounter's own map, or
// (a room with none of its own) its site's published plan; `encounterLocation`
// is the encounter's own location, kept only for the diagnostic messages
// below, which need to tell a room apart from a plain map.
const {
  encounter,
  location: encounterLocation,
  mapLocation: location,
  surface,
  focusRoom,
  terrainZones,
} = useEncounterRoom(encounterId);
const store = useEncounterRunStore();
const toast = useToast();
const { isLive, liveStateLoaded, scheduleMapPush, moveToken } = useEncounterLive(encounterId.value, { follow: true });

// Who runs the fight (#1120). The map opened from the runner in the same tab
// shares the runner's store; one opened in a new window, or reloaded, starts
// with an empty store and follows the live row instead. Decided once, at
// mount: a follower never builds the runner's store, so a "Back to Runner"
// from it lands on a runner that builds itself properly.
const following = store.encounterId !== encounterId.value;

// While live, both windows draw the live row, which the doorbell keeps current:
// the runner pushes HP, turns and conditions into it, and every battle map,
// the players' included, writes token positions into it. Before going live
// there is no row, and only the runner's own tab has a fight to draw.
const combatants = computed<RunCombatant[]>(() => {
  if (isLive.value && liveState.value) return liveState.value.combatants_live;
  return following ? [] : store.combatants;
});
const round = computed(() => (isLive.value && liveState.value ? liveState.value.current_round : store.round));
// The live row's turn indexes the initiative-sorted order, as on the player map.
const activeInstanceId = computed(() => {
  if (!isLive.value || !liveState.value) return following ? null : (store.activeCombatant?.instance_id ?? null);
  return sortCombatantsByInitiative(liveState.value.combatants_live)[liveState.value.active_combatant_index]?.instance_id ?? null;
});
const factions = computed(() => {
  if (!following) return store.factions;
  const own = encounter.value?.factions ?? [];
  return own.length ? own : [...DEFAULT_FACTIONS];
});
// A follower reads the monsters on the board itself (size and art); the
// runner's tab already holds them. No ids, no request.
const { data: followedMonsters } = useMonstersByIds(
  () => (following ? combatants.value.map((c) => c.monster_id) : []),
  { withArt: true },
);
const monsters = computed(() => (following ? [...followedMonsters.value.values()] : store.availableMonsters));

const showTokens = ref(true);
const showZones = ref(true);
const showFog = ref(false);
const showGrid = ref(true);
const portraitOverrides = useCombatantMinis(combatants);
const dollFigures = useCombatantDollFigures(combatants);

// Header (frame 13): "<focus room> — <encounter>" over a status line — the
// segmented control's Site option is what used to be the "← Back to the
// site" / "← Back to Runner" link, so its target and tooltip keep that same
// branch (a plain, non-room-anchored map still goes back to the Runner, not
// to a site page it was never on).
const siteTarget = computed(() =>
  surface.value?.focusRoomId
    ? placeRoute(surface.value.mapLocation.id, "run")
    : `/encounters/${encounterId.value}/run`,
);
const siteTooltip = computed(() => (surface.value?.focusRoomId ? "Back to the site" : "Back to Runner"));
// A room named like its encounter ("The Working Kitchen") is said once.
const title = computed(() => {
  const encounterName = encounter.value?.name ?? "Loading…";
  const roomName = focusRoom.value?.name;
  return roomName && roomName !== encounterName ? `${roomName} · ${encounterName}` : encounterName;
});
const caption = computed(() => {
  if (!isLive.value) return "Encounter ready";
  const n = combatants.value.length;
  return `Encounter running · round ${round.value} · ${n} combatant${n === 1 ? "" : "s"}`;
});
const calibrationFromPublish = computed(() => location.value?.map_published_rev != null);

function reportMoveFailure(error: unknown) {
  toast.error(toast.fromError(error, "Couldn't move that token."));
}

// Live, a move goes straight to the row through the position function, which
// lets the DM move any token; the runner's own pushes keep the row's position.
// Before going live the move stays in the runner's store, which Go live sends.
function onTokenMoved(instanceId: string, position: { x: number; y: number }) {
  if (isLive.value) {
    moveToken(instanceId, position).catch(reportMoveFailure);
    return;
  }
  const target = store.combatants.find((c) => c.instance_id === instanceId);
  if (target) target.position = position;
}

// ── Fog of war ────────────────────────────────────────────────────────────

const tool = ref<BattleMapTool>("pan");
const brushShape = ref<BattleMapBrushShape>("round");
const brushSize = ref<1 | 3 | 5>(3);
const previewAsPlayer = ref(false);
const emptyDragSet = new Set<string>();

// Local fog mask, seeded from live state and pushed back on every stroke.
// Mirroring locally lets brush strokes feel instant while the 300ms-debounced
// push catches up.
const fogMask = ref<Set<FogCellKey>>(new Set());

watch(
  () => liveState.value?.fog_mask,
  (encoded) => {
    fogMask.value = decodeFogMask(encoded ?? null);
  },
  { immediate: true },
);

// A pointer position in the fractional image cells the fog, tokens, darkness and doors share; null before the map
// has a size.
function imageCellAt(clientX: number, clientY: number): { x: number; y: number } | null {
  const host = canvasHost.value;
  if (!host || cellPx.value <= 0) return null;
  const rect = host.getBoundingClientRect();
  return {
    x: (clientX - rect.left - gridOrigin.value.x) / cellPx.value,
    y: (clientY - rect.top - gridOrigin.value.y) / cellPx.value,
  };
}

// ── Magical darkness ──────────────────────────────────────────────────────
// Spheres the DM places with the Darkness tool. Mirrored locally like the fog so a click lands at once; the veil (which
// also draws each sphere's edge as a dashed ring, DM view only) and the players' projection follow the pushed state.
const darknessRadius = ref<DarknessRadius>(15);
const darknessZones = ref<MagicalDarknessZone[]>([]);

watch(
  () => liveState.value?.magical_darkness,
  (zones) => {
    if (zones) darknessZones.value = zones;
  },
  { immediate: true },
);

function pushDarkness() {
  if (!isLive.value) return;
  scheduleMapPush({ magicalDarkness: darknessZones.value });
}

// A click inside a sphere removes the topmost one there; a click elsewhere places a new one centred on the click, in
// the fractional image cells the fog and tokens use. There is no drag.
function placeDarknessAt(clientX: number, clientY: number) {
  const at = imageCellAt(clientX, clientY);
  if (!at) return;
  const { x, y } = at;
  const hit = zoneIdAt(darknessZones.value, x, y);
  darknessZones.value =
    hit === null
      ? [...darknessZones.value, { id: crypto.randomUUID(), x, y, radius: darknessRadius.value }]
      : darknessZones.value.filter((z) => z.id !== hit);
  pushDarkness();
}

// ── Doors ─────────────────────────────────────────────────────────────────
// The DM's open and shut doors over the drawn ones (#1073), kept on the fight. Mirrored locally like the darkness so a
// click lands at once; light, sight and the leaf follow the pushed state for the DM and every player.
const doorStates = ref<MapLiveDoorState[]>([]);

watch(
  () => liveState.value?.door_states,
  (states) => {
    // A re-read hands a fresh array of equal content; keeping ours spares the light grids rebuilt on its identity.
    if (states && !sameDoorStates(doorStates.value, states)) doorStates.value = states;
  },
  { immediate: true },
);

function pushDoors() {
  if (!isLive.value) return;
  scheduleMapPush({ doorStates: doorStates.value });
}

// A click on a door's edge flips it; a click anywhere else does nothing. Fractional image cells, as for the darkness.
function toggleDoorAt(clientX: number, clientY: number) {
  const drawn = surface.value?.live?.doors;
  const at = imageCellAt(clientX, clientY);
  if (!drawn || !at) return;
  const edge = doorEdgeAt(effectiveDoors(drawn, doorStates.value), at.x, at.y);
  if (edge === null) return;
  doorStates.value = toggleDoor(drawn, doorStates.value, edge);
  pushDoors();
}

// Entering combat seeds the party into the room they already occupy, and
// starts the room's own cells revealed — "you are standing in it" (frame
// 13/16). Token placement is idempotent on its own (only fills combatants
// with no position yet), so it re-runs every call; the fog seed is gated on
// the row's own `fog_mask`, not a local flag. A component-local "already
// seeded" ref resets on every mount — a browser refresh, or the second
// window `openBattleMapInNewWindow` opens — so it goes false again while the
// encounter is already live and this function then replaces whatever the DM
// had revealed mid-fight with just the focus room. `fog_mask` is server
// truth instead: `goLive` (useEncounterLive.ts) writes it to null on every
// fresh go-live and nothing writes it back to null afterwards, so
// `shouldSeedFog` answers "never seeded this fight" correctly across any
// number of remounts. It also tells a DM's explicit "Hide all" (an empty
// mask, encoded `""`) apart from "never seeded" (`null`) — the case the old
// local flag could not distinguish, which let a surface recompute quietly
// undo a DM's own "Hide all".
//
// Tokens are placed from the live row, never the runner's store: the store does
// not hear players' moves, so seeding from it in a second window would put
// every token a player had moved back at its seat. Each placement is written on
// its own through the position function.
function seedRoomIfNeeded() {
  const s = surface.value;
  const row = liveState.value;
  if (!s || s.focusCells.length === 0 || !row) return;

  const seeded = seedTokenPositions(row.combatants_live, s.focusCells, {
    footprintOf: (c) => c.footprint ?? 1,
  });
  seeded.forEach((c, i) => {
    if (c.position && !row.combatants_live[i]?.position) moveToken(c.instance_id, c.position).catch(reportMoveFailure);
  });

  if (liveState.value && shouldSeedFog(liveState.value.fog_mask)) {
    fogMask.value = seedFogMask(s.focusCells);
    // Mark the row seeded locally right away. The push below is debounced
    // and only mirrors the patch into `liveState` once the write returns, so
    // a surface recompute landing in that window (regions refetching) would
    // otherwise read `null` again and seed a second time over whatever the
    // DM had already brushed.
    liveState.value = { ...liveState.value, fog_mask: encodeFogMask(fogMask.value) };
    pushFog();
  }
}

// A combatant spawned mid-fight joins the roster without a place; the count
// changing seats it like the rest.
watch(
  () => [isLive.value, surface.value, liveState.value?.combatants_live.length] as const,
  ([live]) => {
    if (live) seedRoomIfNeeded();
  },
  { immediate: true },
);

function brushedCells(clientX: number, clientY: number): Set<FogCellKey> {
  const host = canvasHost.value;
  if (!host) return new Set();
  const rect = host.getBoundingClientRect();
  const px = clientX - rect.left;
  const py = clientY - rect.top;
  const fn = brushShape.value === "round" ? roundBrushCells : cellBrushCells;
  return fn({
    pixelX: px,
    pixelY: py,
    cellPx: cellPx.value,
    originX: gridOrigin.value.x,
    originY: gridOrigin.value.y,
    brushCells: brushSize.value,
  });
}

function applyStrokeAt(clientX: number, clientY: number) {
  if (tool.value === "pan") return;
  const mode: FogBrushMode = tool.value === "reveal" ? "reveal" : "rehide";
  fogMask.value = applyBrush(fogMask.value, brushedCells(clientX, clientY), mode);
  pushFog();
}

function pushFog() {
  if (!isLive.value) return;
  scheduleMapPush({ fogMask: encodeFogMask(fogMask.value) });
}

function resetFog(mode: "reveal" | "hide") {
  // "Reveal all" can't enumerate every theoretical cell on an infinite grid,
  // so it just sets a very large pre-populated rect over the visible map
  // bounds. For practical maps this covers everything the player would see.
  if (mode === "reveal") {
    if (!surface.value) return;
    const cellsAcross = surface.value.calibration.cells_per_image_width;
    if (!cellsAcross || imageNaturalH.value <= 0) return;
    const cellsDown = Math.ceil(
      cellsAcross * (imageNaturalH.value / imageNaturalW.value),
    );
    const next = new Set<FogCellKey>();
    for (let y = 0; y < cellsDown; y++) {
      for (let x = 0; x < cellsAcross; x++) next.add(`${x},${y}`);
    }
    fogMask.value = next;
  } else {
    fogMask.value = new Set();
  }
  pushFog();
}

const {
  canvasHost,
  hostW,
  hostH,
  imageNaturalW,
  imageNaturalH,
  imageReady,
  panX,
  panY,
  scale,
  onImageLoad,
  onWheel,
  startPan,
  continuePan,
  endPan,
  resetView,
} = useMapCanvas();

const loadingState = computed(() => {
  if (!encounter.value) return "Loading encounter…";
  if (!encounter.value.location_id) {
    return "This encounter is not linked to a location. Set a location with a calibrated map to use the battle view.";
  }
  if (!encounterLocation.value) return "Loading location…";
  if (!surface.value) {
    // Check the map stack first: an interior space (room or grounds — #886)
    // can have its own uncalibrated Picture or Drawing even while its site's
    // plan is also uncalibrated, and that case needs "calibrate", not "no
    // map of its own" — the room does have one. `isInteriorType` is the
    // single reader of that distinction.
    if (isInteriorType(encounterLocation.value.location_type)) {
      return hasAnyMapLayer(encounterLocation.value)
        ? "This room's map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale."
        : "This room has no map of its own, and its site isn't calibrated either. Trace and publish a plan for the site first.";
    }
    return hasAnyMapLayer(encounterLocation.value)
      ? "This map is not calibrated yet. Open the location and click \"Calibrate grid\" to set the 5-ft scale."
      : "The linked location has no map. Upload or bake a map for this location first.";
  }
  // A room rides its site's own publish — already a legal battle map at
  // combat's cell scale (frame 13) — so only a plain, non-room-anchored map
  // still needs the explicit flag that hides tactical art from players.
  if (surface.value.focusRoomId === null && !surface.value.mapLocation.is_battle_map) {
    return "This location's map isn't marked as a battle map. Open the location and tick \"Battle map\" to use it in the VTT.";
  }
  // A window that follows the fight has nothing to follow until it is live.
  if (following && liveStateLoaded.value && !isLive.value) {
    return "This window follows the live fight. Go live in the runner and the tokens appear here.";
  }
  return null;
});

// Brush mode hijacks the host's pointer events: tool != "pan" → brush stroke,
// otherwise defer to the shared composable's pan handlers.
const brushing = ref(false);

function onPointerDown(e: PointerEvent) {
  if (!imageReady.value) return;
  if (tool.value === "darkness") {
    placeDarknessAt(e.clientX, e.clientY);
    return;
  }
  if (tool.value === "doors") {
    toggleDoorAt(e.clientX, e.clientY);
    return;
  }
  if (tool.value !== "pan") {
    brushing.value = true;
    (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    applyStrokeAt(e.clientX, e.clientY);
    return;
  }
  startPan(e);
}

function onPointerMove(e: PointerEvent) {
  if (brushing.value) {
    applyStrokeAt(e.clientX, e.clientY);
    return;
  }
  continuePan(e);
}

function onPointerUp(e: PointerEvent) {
  brushing.value = false;
  endPan(e);
}

const cellPx = computed(() =>
  surface.value
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: surface.value.calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);

const gridOrigin = computed(() =>
  surface.value
    ? gridOriginInDisplay({
        panX: panX.value,
        panY: panY.value,
        scale: scale.value,
        imageNaturalWidth: imageNaturalW.value,
        imageNaturalHeight: imageNaturalH.value,
        originXPct: surface.value.calibration.origin_x_pct,
        originYPct: surface.value.calibration.origin_y_pct,
      })
    : { x: 0, y: 0 },
);

const gridVerticals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : [],
);
const gridHorizontals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : [],
);
const gridStrokeOpacity = computed(
  () => surface.value?.calibration.grid_opacity ?? DEFAULT_GRID_OPACITY,
);
</script>

<style scoped>
.map-root {
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  background: #0b0b10;
  color: #e7e7ea;
}

.map-canvas-host {
  position: relative;
  flex: 1;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
}
.map-canvas-host:active {
  cursor: grabbing;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: var(--font-fell, "Crimson Pro", Georgia, serif);
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.55);
  padding: 2rem;
  line-height: 1.6;
  max-width: 32rem;
  margin: 0 auto;
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
