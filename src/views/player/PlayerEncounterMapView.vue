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
      @pointermove="continuePan"
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

      <!-- Fog layer (always opaque on the player side) -->
      <BattleMapFogLayer
        v-if="location && imageReady && cellPx > 0"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :mask="fogMask"
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
import { computed, ref, watch } from "vue";
import { usePlayerVisibleLocation } from "@/composables/locations/useLocations";
import { liveState, updateCombatantPosition } from "@/composables/encounters/useEncounterLive";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import { useAuthStore } from "@/stores/auth";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import { decodeFogMask, revealedCombatants } from "@/lib/battlemap/fogMask";
import { AMBIENT, NO_ZONES, type DarknessZone } from "@/lib/battlemap/illumination";
import { sameDoorStates } from "@/lib/battlemap/doors";
import { currentMapLive } from "@/lib/battlemap/liveLayer";
import { pictureUnderDrawing } from "@/lib/battlemap/roomBridge";
import { NO_DOOR_STATES, occludersOf } from "@/lib/battlemap/occlusion";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import type { MapLiveDoorState } from "@/types/mapLive.types";
import { seenCombatants, type LitScene, type Viewer } from "@/lib/battlemap/vision";
import { useParty } from "@/composables/party/useParty";
import { useIsMobile } from "@/composables/useBreakpoint";
import { useToast } from "@/composables/useToast";
import PlayMovePath, { type PathLine } from "@/components/encounters/play/PlayMovePath.vue";
import { combatantSpeed } from "@/components/encounters/play/playSpeed";
import PlayerMapTurnHeader from "@/components/player/PlayerMapTurnHeader.vue";
import PlayerMapMoveSheet from "@/components/player/PlayerMapMoveSheet.vue";
import PlayerMapNav from "@/components/player/PlayerMapNav.vue";
import { actsBefore, moveTo, ownMove, panToCentre, pointerToCell, type OwnMove } from "@/components/player/playerMapMove";
import type { Cell } from "@/lib/battlemap/movement";
import { useSpeciesByIds } from "@/composables/rules/useSpecies";
import { characterSenses } from "@/rules/characterSenses";
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
const toast = useToast();

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

// Decode only when the source string actually changes (a plain `computed`
// would re-decode on every liveState mutation, including unrelated token
// HP / position pushes that happen many times per second during combat).
const fogMask = ref<Set<string>>(new Set());
watch(
  () => liveState.value?.fog_mask ?? null,
  (src) => { fogMask.value = decodeFogMask(src); },
  { immediate: true },
);

// Player view: combatants whose anchor cell sits in a fogged cell are
// hidden, regardless of reveal_state. This is the "monsters walk out of
// sight" feature without LoS — just a cell membership check. Tokens with
// no position render at the origin row (visible by default).
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

const liveCombatants = computed<RunCombatant[] | null>(() => {
  // Campaign-level kill switch: when the DM has disabled VTT tokens for
  // players, omit the token layer entirely (map + fog only).
  if (!showTokens.value) return [];
  const list = liveState.value?.combatants_live;
  if (!list) return null;
  // "Tokens obey fog" (#884, wave 4): a monster that has walked out of
  // revealed space disappears from the player's own map, VTT tokens or not.
  const revealed = revealedCombatants(list, fogMask.value);
  // In the dark a token you cannot see is not drawn either (#1073 story 5); fog above still applies.
  return sight.value ? seenCombatants(revealed, sight.value.scene, sight.value.viewers, ownInstanceId.value) : revealed;
});
// Sight (#1073 story 5): a player sees the lit map through their own token, by the rules. Senses are the better of the
// species' darkvision and the character's own senses field (`characterSenses`).
const { data: party } = useParty();
const ownMember = computed(() =>
  auth.linkedPartyMemberId ? (party.value?.find((m) => m.id === auth.linkedPartyMemberId) ?? null) : null,
);
const { data: speciesById } = useSpeciesByIds(() => [ownMember.value?.species_id]);
const ownSenses = computed(() => {
  const member = ownMember.value;
  const species = member?.species_id ? speciesById.value.get(member.species_id) : undefined;
  return characterSenses({ species, subrace: member?.subrace, senses: member?.senses });
});
// Spheres of magical darkness the DM placed (story 10), from the player-safe projection of the live row.
const zones = computed<readonly DarknessZone[]>(() => (liveState.value ? liveState.value.magical_darkness : NO_ZONES));
// Doors the DM opened or shut this fight, from the same projection. A re-read hands a fresh array of equal content;
// the previous one is kept so the occluders memoised on its identity are not rebuilt.
const doorStates = computed<readonly MapLiveDoorState[]>((prev) => {
  const next = liveState.value ? liveState.value.door_states : NO_DOOR_STATES;
  return prev && sameDoorStates(prev, next) ? prev : next;
});
// Only a dark or dim map, or one with a sphere of magical darkness, has sight to apply: in plain daylight everything is
// seen, so there is no scene and no viewers.
// Viewers are the own token's centre; a player with no token on the map sees only what is lit.
const sight = computed<{ scene: LitScene; viewers: Viewer[] } | null>(() => {
  if (!live.value || (live.value.darkness === "daylight" && zones.value.length === 0)) return null;
  const scene: LitScene = {
    ambient: AMBIENT[live.value.darkness],
    sources: live.value.lights,
    occluders: occludersOf(live.value, doorStates.value),
    zones: zones.value,
  };
  const own = liveState.value?.combatants_live?.find((c) => c.instance_id === ownInstanceId.value);
  if (!own?.position) return { scene, viewers: [] };
  const half = combatantFootprint(own) / 2;
  const { darkvision, blindsight, truesight, devilsSight } = ownSenses.value;
  const viewer: Viewer = {
    x: own.position.x + half,
    y: own.position.y + half,
    darkvisionFeet: darkvision,
    blindsightFeet: blindsight,
    truesightFeet: truesight,
    devilsSightFeet: devilsSight,
  };
  return { scene, viewers: [viewer] };
});
const viewers = computed<Viewer[] | null>(() => (sight.value ? sight.value.viewers : null));
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

async function onOwnTokenMoved(instanceId: string, position: { x: number; y: number }) {
  if (!liveState.value) return;
  if (instanceId !== ownInstanceId.value) return;
  try {
    await updateCombatantPosition(liveState.value.id, instanceId, position);
  } catch (e) {
    toast.error(toast.fromError(e, "Couldn't move your token."));
  }
}

// ── Turn, header and following ──────────────────────────────────────────────
const ownCombatant = computed(() => liveState.value?.combatants_live?.find((c) => c.instance_id === ownInstanceId.value) ?? null);
const isMyTurn = computed(() => ownInstanceId.value !== null && activeInstanceId.value === ownInstanceId.value);
const activeCombatant = computed(() => liveState.value?.combatants_live?.find((c) => c.instance_id === activeInstanceId.value) ?? null);
const ownSpeed = computed(() => (ownCombatant.value ? combatantSpeed(ownCombatant.value, { monsters: [], npcs: [], members: party.value ?? [] }) : null));
const ownUsedFeet = computed(() => (isMyTurn.value ? (ownCombatant.value?.movement_used ?? 0) : 0));

const turnTitle = computed(() => {
  if (isMyTurn.value) return "Your turn";
  return activeCombatant.value && (activeCombatant.value.reveal_state ?? "revealed") === "revealed"
    ? `${activeCombatant.value.name}'s turn`
    : "Waiting for your turn";
});
const turnSubtitle = computed(() => {
  const round = liveState.value ? `Round ${liveState.value.current_round}` : null;
  if (isMyTurn.value) {
    if (ownSpeed.value === null) return round;
    return `${round} · ${Math.max(0, ownSpeed.value - ownUsedFeet.value)} ft to move`;
  }
  const list = liveState.value?.combatants_live;
  const before = list && ownInstanceId.value ? actsBefore(sortCombatantsByInitiative(list), ownInstanceId.value) : null;
  return before ? `You're after the ${before}` : round;
});
const turnPortraitUrl = computed(() => ownCombatant.value?.portrait_url ?? null);
const ownHp = computed(() => (ownCombatant.value ? { current: ownCombatant.value.hp, max: ownCombatant.value.max_hp } : null));

// Following: the map sits on whoever is up (you, on your turn) until the player turns it off in the header.
const follow = ref(true);

// ── Moving: tap your token, then a square ───────────────────────────────────
const picked = ref(false);
const pickedSet = computed<ReadonlySet<string> | null>(() => (picked.value && ownInstanceId.value ? new Set([ownInstanceId.value]) : null));
const target = ref<Cell | null>(null);
const dragTo = ref<Cell | null>(null);
const moving = ref(false);

const ownFootprint = computed(() => (ownCombatant.value ? combatantFootprint(ownCombatant.value) : 1));

function movePlan(to: Cell | null, tapped: boolean): OwnMove | null {
  const from = ownCombatant.value?.position;
  if (!to || !from || !ownInstanceId.value) return null;
  const common = { instanceId: ownInstanceId.value, from, footprint: ownFootprint.value, speed: ownSpeed.value, usedFeet: ownUsedFeet.value };
  return tapped ? ownMove({ ...common, pointer: to }) : moveTo({ ...common, to });
}
// `target` is the pointer's place in cells, so the snap happens here, the same rounding a drag uses.
const pending = computed(() => movePlan(target.value, true));
const dragging = computed(() => movePlan(dragTo.value, false));
const pathLines = computed<PathLine[]>(() => {
  const m = pending.value ?? dragging.value;
  return m ? [m.line] : [];
});

function onOwnTokenTapped(instanceId: string) {
  if (instanceId !== ownInstanceId.value) return;
  picked.value = true;
}
function onOwnTokenDragPreview(instanceId: string, to: Cell | null) {
  dragTo.value = instanceId === ownInstanceId.value ? to : null;
}

function cancelMove() {
  target.value = null;
  picked.value = false;
}

async function confirmMove() {
  const m = pending.value;
  if (!m || !ownInstanceId.value) return;
  moving.value = true;
  try {
    await onOwnTokenMoved(ownInstanceId.value, m.plan.to);
  } finally {
    moving.value = false;
    cancelMove();
  }
}

// A tap is a press that neither travelled nor shared the screen with a second finger; anything else is a pan or pinch.
const TAP_SLOP_PX = 8;
let tapStart: { x: number; y: number } | null = null;
function onHostDown(e: PointerEvent) {
  tapStart = e.isPrimary ? { x: e.clientX, y: e.clientY } : null;
  startPan(e);
}
function onHostUp(e: PointerEvent) {
  const start = tapStart;
  tapStart = null;
  endPan(e);
  if (!start || !picked.value || !canvasHost.value || cellPx.value <= 0) return;
  if (Math.hypot(e.clientX - start.x, e.clientY - start.y) > TAP_SLOP_PX) return;
  target.value = pointerToCell(e, canvasHost.value.getBoundingClientRect(), gridOrigin.value, cellPx.value);
}
function onHostCancel(e: PointerEvent) {
  tapStart = null;
  endPan(e);
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

// Phone: zoom to a playable size once, then keep the token of whoever is up in the middle (you, on your turn).
// Each move of that token pans again; a player's own pan stays until the next move or turn.
const PHONE_CELL_PX = 56;
const followTarget = computed(() => (isMyTurn.value ? ownCombatant.value : activeCombatant.value));
let zoomed = false;
watch(
  () => [isPhone.value, follow.value, imageReady.value, cellPx.value > 0, hostW.value > 0, followTarget.value?.instance_id, followTarget.value?.position?.x, followTarget.value?.position?.y],
  () => {
    const t = followTarget.value;
    if (!isPhone.value || !follow.value || !imageReady.value || cellPx.value <= 0 || !t?.position) return;
    if (!zoomed) {
      scale.value = scale.value * (PHONE_CELL_PX / cellPx.value);
      zoomed = true;
    }
    const pan = panToCentre({
      hostW: hostW.value,
      hostH: hostH.value,
      origin: gridOrigin.value,
      cellPx: cellPx.value,
      pan: { x: panX.value, y: panY.value },
      at: t.position,
      footprint: combatantFootprint(t),
    });
    panX.value = pan.x;
    panY.value = pan.y;
  },
  { immediate: true },
);
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
