<template>
  <div class="table-screen" data-testid="table-screen">
    <div ref="canvasHost" class="table-host">
      <p v-if="message" class="table-message" data-testid="table-message">{{ message }}</p>

      <template v-else>
        <BattleMapStack
          v-if="imageReady"
          :host-w="hostW"
          :host-h="hostH"
          :layers="surface"
          :pan-x="panX"
          :pan-y="panY"
          :image-w="imageNaturalW * scale"
          :image-h="imageNaturalH * scale"
          :show-grid="false"
          :grid-verticals="[]"
          :grid-horizontals="[]"
          :grid-stroke-opacity="gridStrokeOpacity"
          :cell-px="cellPx"
          :origin-x="gridOrigin.x"
          :origin-y="gridOrigin.y"
          :viewers="viewers"
          :zones="zones"
          :door-states="doorStates"
        />

        <BattleMapTokenLayer
          v-if="imageReady && cellPx > 0"
          :host-w="hostW"
          :host-h="hostH"
          :cell-px="cellPx"
          :origin-x="gridOrigin.x"
          :origin-y="gridOrigin.y"
          :combatants="combatants"
          :hide-hidden="true"
          :silhouette-unseen="true"
          :factions="factions"
          :monsters="monsters"
          :active-instance-id="activeInstanceId"
          :draggable-instance-ids="NOBODY"
          :portrait-overrides="portraitOverrides"
          :figures="dollFigures"
        />

        <BattleMapFogLayer
          v-if="imageReady && cellPx > 0"
          :host-w="hostW"
          :host-h="hostH"
          :cell-px="cellPx"
          :origin-x="gridOrigin.x"
          :origin-y="gridOrigin.y"
          :mask="fogMask"
          :opaque="true"
        />

        <PlayTableMarks
          v-if="imageReady && cellPx > 0"
          :host-w="hostW"
          :host-h="hostH"
          :cell-px="cellPx"
          :origin-x="gridOrigin.x"
          :origin-y="gridOrigin.y"
          :pings="channel.pings.value"
          :measures="channel.measures.value"
          :drawings="channel.drawings.value"
        />

        <img v-if="surface.imageUrl && !imageReady" :src="surface.imageUrl" class="hidden-loader" @load="onImageLoad" />
      </template>
    </div>

    <div v-if="order" class="table-top">
      <TableRibbon :order="order" :factions="factions" :active-instance-id="activeInstanceId" />
    </div>

    <div class="table-turn" data-testid="table-turn">
      <p class="eyebrow">{{ eyebrow }}</p>
      <p v-if="title" class="title">{{ title }}</p>
    </div>

    <p class="table-note" data-testid="table-note">{{ note }}</p>
  </div>
</template>

<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import BattleMapFogLayer from "@/components/encounters/BattleMapFogLayer.vue";
import BattleMapStack from "@/components/encounters/BattleMapStack.vue";
import BattleMapTokenLayer from "@/components/encounters/BattleMapTokenLayer.vue";
import { useCombatantDollFigures } from "@/composables/encounters/useCombatantDollFigures";
import { useCombatantMinis } from "@/composables/encounters/useCombatantMinis";
import { useMapCanvas } from "@/composables/encounters/useMapCanvas";
import { useTableChannel } from "@/composables/table/useTableChannel";
import { cellSizeInDisplay, gridOriginInDisplay } from "@/lib/battlemap/battleMapGeometry";
import type { FogCellKey } from "@/lib/battlemap/fogMask";
import type { DarknessZone } from "@/lib/battlemap/illumination";
import { NO_ZONES } from "@/lib/battlemap/illumination";
import { NO_DOOR_STATES } from "@/lib/battlemap/occlusion";
import type { BattleSurface } from "@/lib/battlemap/roomBridge";
import type { Viewer } from "@/lib/battlemap/vision";
import { combatantFootprint } from "@/lib/battlemap/tokenFootprint";
import { panToKeepInView } from "@/lib/table/follow";
import { prefersReducedMotion } from "@/lib/motion";
import { useCampaignStore } from "@/stores/campaign";
import { DEFAULT_GRID_OPACITY } from "@/types/location.types";
import type { FactionColor, RunCombatant } from "@/types/encounter.types";
import type { MapLiveDoorState } from "@/types/mapLive.types";
import type { Monster } from "@/types/monster.types";
import PlayTableMarks from "@/components/encounters/play/PlayTableMarks.vue";
import TableRibbon from "./TableRibbon.vue";

/**
 * The Table screen (#1125 frame 13, decision 15): the map alone, in the players' eyes, for a screen the table looks
 * at. It draws what it is handed and decides nothing: `lib/table/tableScreen.ts` has already taken away what the
 * players may not see. It follows `follow` smoothly, plays a moving map through the stack, and shows the marks the
 * table sends over the channel.
 */
const {
  surface,
  combatants,
  fogMask,
  factions = [],
  monsters = [],
  activeInstanceId = null,
  doorStates = NO_DOOR_STATES,
  zones = NO_ZONES,
  follow = null,
  order = null,
  eyebrow,
  title = null,
  followNote = "Follows the turn",
  message = null,
} = defineProps<{
  surface: BattleSurface;
  /** Already what the table may see: the map draws exactly these. */
  combatants: RunCombatant[];
  fogMask: Set<FogCellKey>;
  factions?: readonly FactionColor[];
  monsters?: Monster[];
  activeInstanceId?: string | null;
  doorStates?: readonly MapLiveDoorState[];
  zones?: readonly DarknessZone[];
  /** What to keep in view: its square and how many squares it covers. Null follows nothing. */
  follow?: { position: { x: number; y: number }; footprint: number } | null;
  /** The initiative order, or null for no ribbon (exploring). */
  order?: readonly RunCombatant[] | null;
  eyebrow: string;
  title?: string | null;
  followNote?: string;
  /** Why there is nothing to draw yet. */
  message?: string | null;
}>();

const NOBODY = new Set<string>();

const { canvasHost, hostW, hostH, imageNaturalW, imageNaturalH, imageReady, panX, panY, scale, onImageLoad } = useMapCanvas();

const cellPx = computed(() =>
  cellSizeInDisplay({
    imageNaturalWidth: imageNaturalW.value,
    cellsPerImageWidth: surface.calibration.cells_per_image_width,
    scale: scale.value,
  }),
);
const gridOrigin = computed(() =>
  gridOriginInDisplay({
    panX: panX.value,
    panY: panY.value,
    scale: scale.value,
    imageNaturalWidth: imageNaturalW.value,
    imageNaturalHeight: imageNaturalH.value,
    originXPct: surface.calibration.origin_x_pct,
    originYPct: surface.calibration.origin_y_pct,
  }),
);
const gridStrokeOpacity = computed(() => surface.calibration.grid_opacity ?? DEFAULT_GRID_OPACITY);

const portraitOverrides = useCombatantMinis(() => combatants);
const dollFigures = useCombatantDollFigures(() => combatants);

// Sight in the dark is the party's: a character sees what is lit around them. Their senses are not known to a window
// with no character behind it, so none is assumed (the screen shows no more than a player standing there would see).
const viewers = computed<Viewer[]>(() =>
  combatants
    .filter((c) => c.type === "player" && c.position)
    .map((c) => {
      const half = combatantFootprint(c) / 2;
      const at = c.position ?? { x: 0, y: 0 };
      return { x: at.x + half, y: at.y + half, darkvisionFeet: 0, blindsightFeet: 0, truesightFeet: 0, devilsSightFeet: 0 };
    }),
);

// ── The table channel: marks only arrive here, this window sends none ───────
const campaign = useCampaignStore();
const channel = useTableChannel(() => campaign.activeCampaignId, { identity: () => null });

const pinger = ref<string | null>(null);
let pingerTimer: ReturnType<typeof setTimeout> | null = null;
watch(
  () => channel.pings.value.length,
  (count, before) => {
    const latest = channel.pings.value[channel.pings.value.length - 1];
    if (count <= before || !latest) return;
    pinger.value = latest.by.name;
    if (pingerTimer) clearTimeout(pingerTimer);
    pingerTimer = setTimeout(() => (pinger.value = null), 6000);
  },
);
const note = computed(() => (pinger.value ? `${followNote} · ${pinger.value} pinged the map` : followNote));

// ── Following ───────────────────────────────────────────────────────────────
const PAN_MS = 700;
let frame = 0;

function glide(toX: number, toY: number) {
  cancelAnimationFrame(frame);
  if (prefersReducedMotion()) {
    panX.value = toX;
    panY.value = toY;
    return;
  }
  const fromX = panX.value;
  const fromY = panY.value;
  const started = performance.now();
  const step = (now: number) => {
    const t = Math.min(1, (now - started) / PAN_MS);
    const eased = 1 - (1 - t) ** 3;
    panX.value = fromX + (toX - fromX) * eased;
    panY.value = fromY + (toY - fromY) * eased;
    if (t < 1) frame = requestAnimationFrame(step);
  };
  frame = requestAnimationFrame(step);
}
onBeforeUnmount(() => {
  cancelAnimationFrame(frame);
  if (pingerTimer) clearTimeout(pingerTimer);
});

watch(
  () => [follow?.position.x, follow?.position.y, follow?.footprint, imageReady.value, cellPx.value > 0] as const,
  () => {
    if (!follow || !imageReady.value || cellPx.value <= 0) return;
    const mid = follow.footprint / 2;
    const { dx, dy } = panToKeepInView({
      hostW: hostW.value,
      hostH: hostH.value,
      centre: {
        x: gridOrigin.value.x + (follow.position.x + mid) * cellPx.value,
        y: gridOrigin.value.y + (follow.position.y + mid) * cellPx.value,
      },
    });
    if (dx !== 0 || dy !== 0) glide(panX.value + dx, panY.value + dy);
  },
  { immediate: true },
);
</script>

<style scoped>
.table-screen {
  position: relative;
  width: 100%;
  height: 100dvh;
  overflow: hidden;
  /* The one dark colour the screen needs behind the map, drawn from the theme rather than a hex. */
  --table-night: color-mix(in oklab, black 94%, var(--primary));
  background: var(--table-night);
  color: #fff;
}
.table-host {
  position: absolute;
  inset: 0;
  overflow: hidden;
}
.table-message {
  position: absolute;
  inset: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0;
  padding: 2rem;
  text-align: center;
  font-size: 1.5rem;
  color: rgb(255 255 255 / 0.6);
}
.table-top {
  position: absolute;
  top: 1rem;
  left: 0;
  right: 0;
  display: flex;
  justify-content: center;
  pointer-events: none;
}
.table-turn {
  position: absolute;
  left: 2rem;
  bottom: 1.75rem;
  pointer-events: none;
}
.eyebrow {
  margin: 0;
  font-size: 0.875rem;
  font-weight: 700;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #d4636f;
  text-shadow: 0 1px 6px rgb(0 0 0 / 0.9);
}
.title {
  margin: 0.25rem 0 0;
  font-family: var(--font-cinzel, "Cinzel", serif);
  font-size: 2.75rem;
  font-weight: 700;
  line-height: 1.1;
  text-shadow: 0 2px 12px rgb(0 0 0 / 0.95), 0 0 2px rgb(0 0 0 / 0.9);
}
.table-note {
  position: absolute;
  right: 2rem;
  bottom: 1.75rem;
  margin: 0;
  font-size: 0.875rem;
  color: rgb(255 255 255 / 0.65);
  text-shadow: 0 1px 6px rgb(0 0 0 / 0.9);
  pointer-events: none;
}
.hidden-loader {
  position: absolute;
  width: 0.0625rem;
  height: 0.0625rem;
  opacity: 0;
  pointer-events: none;
}
</style>
