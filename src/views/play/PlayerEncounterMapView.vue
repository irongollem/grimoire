<template>
  <div class="map-root">
    <!-- Top bar -->
    <div class="map-topbar">
      <RouterLink to="/play/encounter" class="back-link">← Back</RouterLink>
      <span class="encounter-name">{{ encounter?.name ?? "Battle Map" }}</span>
      <div class="topbar-right">
        <span class="hint">{{ Math.round(scale * 100) }}%</span>
        <button class="zoom-btn" title="Reset view" @click="resetView">Reset</button>
      </div>
    </div>

    <div
      ref="canvasHost"
      class="map-canvas-host"
      @wheel.prevent="onWheel"
      @pointerdown="startPan"
      @pointermove="continuePan"
      @pointerup="endPan"
      @pointerleave="endPan"
    >
      <div v-if="loadingState" class="empty-state">{{ loadingState }}</div>

      <svg
        v-else-if="location && imageReady"
        class="map-svg"
        :viewBox="`0 0 ${hostW} ${hostH}`"
        preserveAspectRatio="none"
      >
        <image
          :href="location.map_url ?? undefined"
          :x="panX"
          :y="panY"
          :width="imageNaturalW * scale"
          :height="imageNaturalH * scale"
        />
        <g class="grid">
          <line
            v-for="(x, i) in gridVerticals"
            :key="`v-${i}`"
            :x1="x"
            :y1="0"
            :x2="x"
            :y2="hostH"
            stroke="#000"
            :stroke-opacity="gridStrokeOpacity"
            stroke-width="1"
          />
          <line
            v-for="(y, i) in gridHorizontals"
            :key="`h-${i}`"
            :x1="0"
            :y1="y"
            :x2="hostW"
            :y2="y"
            stroke="#000"
            :stroke-opacity="gridStrokeOpacity"
            stroke-width="1"
          />
        </g>
      </svg>

      <BattleMapTokenLayer
        v-if="location && imageReady && cellPx > 0 && liveCombatants"
        :host-w="hostW"
        :host-h="hostH"
        :cell-px="cellPx"
        :origin-x="gridOrigin.x"
        :origin-y="gridOrigin.y"
        :combatants="liveCombatants"
        :factions="encounter?.factions ?? []"
        :active-instance-id="activeInstanceId"
        :draggable-instance-ids="draggableSet"
        :hide-hidden="true"
        :silhouette-unseen="true"
        :on-position-change="onOwnTokenMoved"
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
        v-if="location?.map_url && !imageReady"
        :src="location.map_url"
        class="hidden-loader"
        @load="onImageLoad"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import { useEncounter } from "@/composables/useEncounters";
import { usePlayerVisibleLocation } from "@/composables/useLocations";
import { liveState, updateOwnCombatantPosition } from "@/composables/useEncounterLive";
import { useMapCanvas } from "@/composables/useMapCanvas";
import { useAuthStore } from "@/stores/auth";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import { decodeFogMask } from "@/lib/fogMask";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import { useCampaignStore } from "@/stores/campaign";
import type { RunCombatant } from "@/types/encounter.types";
import { sortCombatantsByInitiative } from "@/lib/combatantSort";
import {
  gridLinePositions,
  cellSizeInDisplay,
  gridOriginInDisplay,
} from "@/lib/battleMapGeometry";

const router = useRouter();

const MOBILE_BREAKPOINT_PX = 768;

function isMobile(): boolean {
  return typeof window !== "undefined" && window.innerWidth < MOBILE_BREAKPOINT_PX;
}

onMounted(() => {
  // Phones don't see the battle map — bounce back to the stats panel.
  if (isMobile()) {
    router.replace("/play/encounter");
  }
});

const encounterIdRef = computed(() => liveState.value?.encounter_id ?? "");
const { data: encounter } = useEncounter(encounterIdRef);
const locationIdRef = computed(() => encounter.value?.location_id ?? "");
const { data: location } = usePlayerVisibleLocation(locationIdRef);

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
const campaignStore = useCampaignStore();
const showTokens = computed(
  () => campaignStore.activeCampaign?.battle_map_show_tokens ?? true,
);

const liveCombatants = computed<RunCombatant[] | null>(() => {
  // Campaign-level kill switch: when the DM has disabled VTT tokens for
  // players, omit the token layer entirely (map + fog only).
  if (!showTokens.value) return [];
  const list = liveState.value?.combatants_live;
  if (!list) return null;
  const mask = fogMask.value;
  return list.filter((c) => {
    if (!c.position) return true;
    return mask.has(`${c.position.x},${c.position.y}`);
  });
});
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

// Players may only drag their own combatant. The set is computed reactively
// from the auth store's linkedPartyMemberId, matching the `p-{id}` format
// the server expects.
const auth = useAuthStore();
const ownInstanceId = computed(() =>
  auth.linkedPartyMemberId ? `p-${auth.linkedPartyMemberId}` : null,
);
const draggableSet = computed(() =>
  ownInstanceId.value ? new Set([ownInstanceId.value]) : new Set<string>(),
);

async function onOwnTokenMoved(instanceId: string, position: { x: number; y: number }) {
  if (!liveState.value) return;
  if (instanceId !== ownInstanceId.value) return;
  try {
    await updateOwnCombatantPosition(liveState.value.id, instanceId, position);
  } catch (e) {
    console.error("Failed to update token position", e);
  }
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
  if (!encounter.value) return "Loading encounter…";
  if (!encounter.value.location_id) return "This encounter has no battle map.";
  if (!location.value) return "Loading location…";
  if (!location.value.map_url) return "The battle map has no image yet.";
  if (!location.value.is_battle_map) return "This isn't a battle map.";
  if (!location.value.grid_calibration) return "The DM hasn't calibrated this map yet.";
  return null;
});

const cellPx = computed(() =>
  location.value?.grid_calibration
    ? cellSizeInDisplay({
        imageNaturalWidth: imageNaturalW.value,
        cellsPerImageWidth: location.value.grid_calibration.cells_per_image_width,
        scale: scale.value,
      })
    : 0,
);

const gridOrigin = computed(() =>
  location.value?.grid_calibration
    ? gridOriginInDisplay({
        panX: panX.value,
        panY: panY.value,
        scale: scale.value,
        imageNaturalWidth: imageNaturalW.value,
        imageNaturalHeight: imageNaturalH.value,
        originXPct: location.value.grid_calibration.origin_x_pct,
        originYPct: location.value.grid_calibration.origin_y_pct,
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
  () => location.value?.grid_calibration?.grid_opacity ?? DEFAULT_GRID_OPACITY,
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
  font-family: var(--font-fell, "IM Fell English", serif);
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

.map-svg {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  user-select: none;
}

.empty-state {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  text-align: center;
  font-family: var(--font-fell, "IM Fell English", serif);
  font-size: 1rem;
  color: rgba(255, 255, 255, 0.55);
  padding: 2rem;
  line-height: 1.6;
}

.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
