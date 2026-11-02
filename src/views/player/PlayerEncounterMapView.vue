<template>
  <div class="map-root">
    <!-- Phone: the turn header (#1125 frame 14). Tablet and up keep the plain top bar. -->
    <PlayerMapTurnHeader
      v-if="isPhone"
      :mine="isMyTurn"
      :title="turnTitle"
      :subtitle="turnSubtitle"
      :portrait-url="turnPortraitUrl"
      :hp="ownHp"
      :following="follow"
      @toggle-follow="follow = !follow"
    />
    <div v-else class="map-topbar">
      <RouterLink to="/play/encounter" class="back-link">← Back</RouterLink>
      <!-- Not the encounter's name: a DM's title can name the twist, and players read only the projection. -->
      <span class="encounter-name">Battle map</span>
      <div class="topbar-right">
        <span class="hint">{{ Math.round(scale * 100) }}%</span>
        <button class="zoom-btn" title="Reset view" @click="resetView">Reset</button>
      </div>
    </div>

    <div
      ref="canvasHost"
      class="map-canvas-host"
      @wheel.prevent="onWheel"
      @pointerdown="onHostDown"
      @pointermove="onHostMove"
      @pointerup="onHostUp"
      @pointercancel="onHostCancel"
      @pointerleave="onHostCancel"
    >
      <div v-if="loadingState" class="empty-state">{{ loadingState }}</div>

      <!-- Ground, water, grid, standing, top live layer (#1073), under tokens and fog. -->
      <BattleMapStack
        v-else-if="location && image && imageReady"
        :host-w="hostW"
        :host-h="hostH"
        :layers="{ imageUrl: image.url, standUrl, standLiveUrl, live, picture, motion: null }"
        :pan-x="panX"
        :pan-y="panY"
        :image-w="imageNaturalW * scale"
        :image-h="imageNaturalH * scale"
        :show-grid="true"
        :grid-verticals="gridVerticals"
        :grid-horizontals="gridHorizontals"
        :grid-stroke-opacity="gridStrokeOpacity"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :viewers="viewers"
        :zones="zones"
        :door-states="doorStates"
      />

      <BattleMapTokenLayer
        v-if="location && imageReady && cellPx > 0 && liveCombatants"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="liveCombatants"
        :figures="dollFigures"
        :factions="factionColors"
        :active-instance-id="activeInstanceId"
        :draggable-instance-ids="draggableSet"
        :selected-instance-ids="pickedSet"
        :hide-hidden="true"
        :silhouette-unseen="true"
        :on-position-change="onOwnTokenMoved"
        :on-select="onOwnTokenTapped"
        :on-drag-preview="onOwnTokenDragPreview"
      />

      <!-- The path and the ghost square a tap or a drag would make; it only draws. -->
      <PlayMovePath
        v-if="location && imageReady && cellPx > 0 && pathLines.length > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :lines="pathLines"
      />

      <!-- What the table has pinged, measured and drawn (#1125 decision 12): players see it all and send only pings. -->
      <PlayTableMarks
        v-if="location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :pings="table.pings.value"
        :measures="table.measures.value"
        :drawings="table.drawings.value"
      />

      <!-- Fog layer (always opaque on the player side) -->
      <BattleMapFogLayer
        v-if="location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="shown"
        :seen="sight"
        :opaque="true"
      />

      <img
        v-if="image?.url && !imageReady"
        :src="image.url"
        class="hidden-loader"
        @load="onImageLoad"
      />

      <!-- Tablet and up: the confirm is a slip over the map. -->
      <PlayerMapMoveSheet
        v-if="pending && !isPhone"
        inline
        @pointerdown.stop
        :feet-text="pending.feetText"
        :label="pending.label"
        :state="pending.state"
        :busy="moving"
        @cancel="cancelMove"
        @move="confirmMove"
      />
    </div>

    <template v-if="isPhone">
      <PlayerMapMoveSheet
        v-if="pending"
        :feet-text="pending.feetText"
        :label="pending.label"
        :state="pending.state"
        :busy="moving"
        @cancel="cancelMove"
        @move="confirmMove"
      />
      <p v-else-if="isMyTurn && ownCombatant?.position" class="tap-hint">Tap your token, then a square. Drag works too.</p>
      <PlayerMapNav />
    </template>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from "vue";
import { usePlayerVisibleLocation } from "@/composables/locations/useLocations";
import { liveState } from "@/composables/encounters/useEncounterLive";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import { useAuthStore } from "@/stores/auth";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import { usePartySight } from "@/composables/encounters/usePartySight";
import { useMapMemory } from "@/composables/locations/useMapMemory";
import { sameDoorStates } from "@/lib/battlemap/doors";
import { NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import { partyVisibleCombatants, shownCells, type MapGrid } from "@/lib/battlemap/partySight";
import type { MapLiveDoorState } from "@/types/mapLive.types";
import { currentMapLive } from "@/lib/battlemap/liveLayer";
import { pictureUnderDrawing } from "@/lib/battlemap/roomBridge";
import { usePlayerMapFollow } from "@/composables/player/usePlayerMapFollow";
import { usePlayerMapPointer } from "@/composables/player/usePlayerMapPointer";
import { usePlayerMapMove } from "@/composables/player/usePlayerMapMove";
import { useIsMobile } from "@/composables/useBreakpoint";
import PlayMovePath from "@/components/encounters/play/PlayMovePath.vue";
import PlayTableMarks from "@/components/encounters/play/PlayTableMarks.vue";
import { useTableChannel } from "@/composables/table/useTableChannel";
import { senderColor } from "@/lib/table/identity";
import PlayerMapTurnHeader from "@/components/player/PlayerMapTurnHeader.vue";
import PlayerMapMoveSheet from "@/components/player/PlayerMapMoveSheet.vue";
import PlayerMapNav from "@/components/player/PlayerMapNav.vue";
import { primaryImage } from "@/lib/locations/mapStack";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import { useCampaignStore } from "@/stores/campaign";
import type { RunCombatant, FactionColor } from "@/types/encounter.types";
import { sortCombatantsByInitiative } from "@/rules/combatantSort";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battlemap/battleMapGeometry";

// Phones get the map too (#1125 decision 14): a header that says whose turn it is, tap-then-square moves with a
// confirm sheet, and a bottom nav.
const isPhone = useIsMobile();

// The battle location and the token ring colours come from the player-safe projection: players cannot read the
// encounter row itself.
const locationIdRef = computed(() => liveState.value?.location_id ?? "");
const factionColors = computed<readonly FactionColor[]>(() =>
  liveState.value?.faction_colors ? liveState.value.faction_colors : [],
);
const { data: location } = usePlayerVisibleLocation(locationIdRef);

// The image this battle view actually draws — the site's Drawing when it
// has one, else its Picture (#884: never `location.map_url` directly, or a
// Drawing-only battle map would render nothing).
const image = computed(() => primaryImage(location.value));
// The snapshot is in the cells of whatever is on screen: the Drawing, or a Picture with no Drawing (same rule as
// `resolveBattleSurface`, which the DM's map uses).
const live = computed(() => (location.value ? currentMapLive(location.value.map_live) : null));
// The Picture under the Drawing (#1125 decision 8), when both are calibrated. Players never get a moving Picture.
const picture = computed(() => pictureUnderDrawing(location.value));

// The standing half rides with the Drawing the same way; a hand-calibrated Picture has none.
const standUrl = computed(() =>
  location.value?.map_layer_url && location.value.map_layer_url === image.value?.url ? location.value.map_layer_stand_url : null,
);

const standLiveUrl = computed(() =>
  location.value?.map_layer_url && location.value.map_layer_url === image.value?.url
    ? location.value.map_layer_stand_live_url
    : null,
);

// Every store this view reads is declared first: the computeds below run during setup (the token filter reads
// `sight`, which reads the own member through `auth`), and a store declared further down would still be in its
// temporal dead zone when they do.
const auth = useAuthStore();
const campaignStore = useCampaignStore();
// Players may only drag their own combatant. The set is computed reactively
// from the auth store's linkedPartyMemberId, matching the `p-{id}` format
// the server expects.
const ownInstanceId = computed(() =>
  auth.linkedPartyMemberId ? `p-${auth.linkedPartyMemberId}` : null,
);
const showTokens = computed(
  () => campaignStore.activeCampaign?.battle_map_show_tokens ?? true,
);

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

// Spheres of magical darkness and the doors the DM opened or shut this fight, from the player-safe projection. A re-read
// hands a fresh array of equal content; the previous one is kept so the occluders memoised on its identity are not rebuilt.
const zones = computed<readonly DarknessZone[]>(() => (liveState.value ? liveState.value.magical_darkness : NO_ZONES));
const doorStates = computed<readonly MapLiveDoorState[]>((prev) => {
  const next = liveState.value ? liveState.value.door_states : NO_DOOR_STATES;
  return prev && sameDoorStates(prev, next) ? prev : next;
});

// The map's grid in battle cells: the calibration gives the columns, the picture's shape the rows.
const mapGrid = computed<MapGrid | null>(() => {
  const calibration = image.value?.calibration;
  if (!calibration || !imageReady.value || imageNaturalW.value <= 0) return null;
  const cols = calibration.cells_per_image_width;
  return { cols, rows: Math.ceil((cols * imageNaturalH.value) / imageNaturalW.value) };
});

// What the phone sees: the whole party's eyes, or only its own character's when the campaign says "each their own".
const { viewers, sight } = usePartySight({
  live,
  doorStates,
  zones,
  tokens: () => (liveState.value?.combatants_live ? liveState.value.combatants_live : []),
  grid: mapGrid,
  onlyInstanceId: () => (campaignStore.activeCampaign?.player_sight === "own" ? ownInstanceId.value : null),
});
// What the map remembers is only read here; the DM's windows write it.
const { memory } = useMapMemory(
  () => campaignStore.activeCampaign?.id ?? null,
  () => location.value?.id ?? null,
);
const shown = computed(() => shownCells(memory.value, sight.value));

const liveCombatants = computed<RunCombatant[] | null>(() => {
  // Campaign-level kill switch: when the DM has disabled VTT tokens for
  // players, omit the token layer entirely (map + fog only).
  if (!showTokens.value) return [];
  const list = liveState.value?.combatants_live;
  if (!list) return null;
  // Your own token always; any other only where the party sees it right now.
  return partyVisibleCombatants(list, sight.value, ownInstanceId.value);
});
const dollFigures = useCombatantDollFigures(() => liveCombatants.value ?? []);
const activeInstanceId = computed(() => {
  const list = liveState.value?.combatants_live;
  if (!list) return null;
  if (liveState.value?.active_combatant_instance_id) {
    return liveState.value.active_combatant_instance_id;
  }
  // active_combatant_index indexes the initiative-SORTED order (see encounterRun),
  // not the fog-filtered liveCombatants list — sort the full list with the shared
  // comparator and match by instance_id (the token layer keys on the id).
  return sortCombatantsByInitiative(list)[liveState.value?.active_combatant_index ?? 0]?.instance_id ?? null;
});

const draggableSet = computed(() =>
  ownInstanceId.value ? new Set([ownInstanceId.value]) : new Set<string>(),
);

const {
  ownCombatant, isMyTurn, activeCombatant, turnTitle, turnSubtitle, turnPortraitUrl, ownHp,
  picked, pickedSet, target, moving, pending, pathLines,
  onOwnTokenMoved, onOwnTokenTapped, onOwnTokenDragPreview, cancelMove, confirmMove,
} = usePlayerMapMove(ownInstanceId, activeInstanceId);

// Following: the map sits on whoever is up (you, on your turn) until the player turns it off in the header.
const follow = ref(true);

// The table's marks: players hear them all and send pings only.
const table = useTableChannel(() => campaignStore.activeCampaign?.id ?? null, {
  identity: () => (auth.user ? { id: auth.user.id, name: auth.publicName ?? "A player", color: senderColor(auth.user.id) } : null),
});

const loadingState = computed(() => {
  if (!liveState.value) return "No live encounter right now.";
  if (!liveState.value) return "Loading encounter…";
  if (!liveState.value.location_id) return "This encounter has no battle map.";
  if (!location.value) return "Loading location…";
  if (!image.value) return "The battle map has no image yet.";
  if (!image.value.calibration) return "The DM hasn't calibrated this map yet.";
  return null;
});

const cellPx = computed(() =>
  image.value?.calibration
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: image.value.calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);

const gridOrigin = computed(() =>
  image.value?.calibration
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

const gridVerticals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.x, hostW.value, cellPx.value) : [],
);
const gridHorizontals = computed(() =>
  cellPx.value > 0 ? gridLinePositions(gridOrigin.value.y, hostH.value, cellPx.value) : [],
);
const gridStrokeOpacity = computed(
  () => image.value?.calibration?.grid_opacity ?? DEFAULT_GRID_OPACITY,
);

const followTarget = computed(() => (isMyTurn.value ? ownCombatant.value : activeCombatant.value));
usePlayerMapFollow({ isPhone, follow, imageReady, cellPx, hostW, hostH, gridOrigin, scale, panX, panY, followTarget });
// A tap picks a square, a held press pings, anything that travels pans (see usePlayerMapPointer).
const { onHostDown, onHostMove, onHostUp, onHostCancel } = usePlayerMapPointer({
  canvasHost, cellPx, gridOrigin, picked, target, sendPing: table.sendPing, pan: { startPan, continuePan, endPan },
});
</script>

<style scoped>
.map-root {
  display: flex;
  flex-direction: column;
  /* Fills <main> through the route's `fillsMain`; without it the padded wrapper
     had no height, the pane collapsed to its top bar, and the empty and loading
     text sat white on the page paper. */
  height: 100%;
  min-height: 0;
  background: #0b0b10;
  color: #e7e7ea;
}

.map-topbar {
  display: flex;
  align-items: center;
  gap: 1rem;
  padding: 0.5rem 1rem;
  border-bottom: 1px solid rgba(255, 255, 255, 0.08);
  background: rgba(0, 0, 0, 0.4);
}

.back-link {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.75rem;
  letter-spacing: 0.05em;
  color: rgba(255, 255, 255, 0.7);
  text-decoration: none;
  transition: color 120ms ease;
}
.back-link:hover {
  color: #fff;
}

.encounter-name {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-weight: 700;
  flex: 1;
}

.topbar-right {
  display: flex;
  align-items: center;
  gap: 0.75rem;
}

.hint {
  font-family: var(--font-fell, "Crimson Pro", Georgia, serif);
  font-size: 0.75rem;
  color: rgba(255, 255, 255, 0.55);
}

.zoom-btn {
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 0.6875rem;
  letter-spacing: 0.05em;
  padding: 0.25rem 0.75rem;
  border: 1px solid rgba(255, 255, 255, 0.15);
  border-radius: 0.25rem;
  background: transparent;
  color: rgba(255, 255, 255, 0.75);
  cursor: pointer;
}
.zoom-btn:hover {
  border-color: rgba(255, 255, 255, 0.4);
  color: #fff;
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
}

.tap-hint {
  padding: 0.5rem 1rem;
  text-align: center;
  font-size: 0.8125rem;
  color: rgb(255 255 255 / 0.55);
  background: rgb(0 0 0 / 0.4);
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
