<template>
  <div
    ref="areaEl"
    class="relative h-full w-full overflow-hidden"
    @pointerenter="pointerOver = true"
    @pointerleave="pointerOver = false"
  >
    <VNetworkGraph
      ref="graphRef"
      v-model:layouts="layouts"
      v-model:zoom-level="zoomLevel"
      :class="spaceHeld && '!cursor-grab'"
      :nodes="graphNodes"
      :edges="graphEdges"
      :configs="graphConfigs"
      :event-handlers="eventHandlers"
      :layers="GRAPH_LAYERS"
      class="h-full w-full touch-none select-none"
      @wheel.prevent="onWheel"
      @pointerdown="cameraTaken = true"
      @mousedown.capture="onMouseDownCapture"
      @pointerdown.capture="onPointerDown"
      @pointermove="onPointerMove"
      @pointerup="onPointerUp"
      @pointercancel="onPointerUp"
    >
      <!-- Every node is one of the seven shapes; the library only places it. -->
      <template #override-node="{ nodeId, scale }">
        <WorldNodeShape
          :kind="graphNodes[nodeId].kind"
          :name="graphNodes[nodeId].name"
          :size="graphNodes[nodeId].nodeSize"
          :scale="scale"
          :fill="graphNodes[nodeId].nodeColor"
          :image="imageOf(nodeId)"
          :focal-point="focalPoints[nodeId]"
          :selected="nodeId === selectedKey || nodeId === connectFrom"
        />
      </template>

      <!--
        The group being drawn, under the edges and nodes so it reads as ground
        rather than as another thing on the graph. Fill plus a thick round-joined
        stroke of the same colour, which rounds the corners and makes the
        degenerate cases work: two members become a capsule and one a disc.
      -->
      <template #groupHull="{ scale }">
        <path
          v-for="(d, i) in hullPaths"
          :key="i"
          :d="d"
          class="fill-primary/10 stroke-primary/25"
          :stroke-width="28 * scale"
          stroke-linejoin="round"
          stroke-linecap="round"
        />
      </template>

      <!-- Faction membership, drawn on the person rather than as lines to a hub. -->
      <template #nodeOverlay="{ scale }">
        <defs>
          <clipPath id="worldweb-pip-clip">
            <circle cx="0" cy="0" :r="PIP_RADIUS" />
          </clipPath>
        </defs>
        <g v-for="badge in nodeBadges" :key="badge.nodeKey">
          <g
            v-for="pip in badge.pips"
            :key="pip.factionId"
            :transform="`translate(${badge.cx + pip.dx * scale}, ${badge.cy + pip.dy * scale})`"
            class="cursor-pointer"
            @pointerenter="onPipEnter($event, pip)"
            @pointerleave="onPipLeave"
            @click.stop="onPipClick(pip)"
          >
            <!-- Two nested transforms on purpose: the outer is an attribute placing the badge, this inner one a style so the browser can transition it. -->
            <g
              :style="{ transform: `scale(${scale * (isPipOpen(pip) ? badge.openScale : 1)})`, transition: pipTransition }"
              :opacity="pip.active ? 1 : 0.45"
            >
              <circle :r="PIP_RADIUS" class="fill-card stroke-border" stroke-width="1" />
              <image
                v-if="pip.emblemUrl"
                :href="pip.emblemUrl"
                :x="-PIP_RADIUS"
                :y="-PIP_RADIUS"
                :width="PIP_RADIUS * 2"
                :height="PIP_RADIUS * 2"
                preserveAspectRatio="xMidYMid slice"
                clip-path="url(#worldweb-pip-clip)"
              />
              <text v-else text-anchor="middle" dominant-baseline="central" :font-size="PIP_RADIUS" class="fill-muted-foreground font-semibold">{{ pip.initial }}</text>
            </g>
          </g>
          <text
            v-if="badge.overflow"
            :x="badge.cx + badge.overflowDx * scale"
            :y="badge.cy + badge.overflowDy * scale"
            text-anchor="middle"
            dominant-baseline="central"
            :font-size="PIP_RADIUS * scale"
            class="fill-muted-foreground font-semibold"
          >+{{ badge.overflow }}</text>
        </g>
      </template>
    </VNetworkGraph>

    <div
      class="pointer-events-none absolute bottom-3 left-3 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-md bg-card/80 px-2 py-1 text-label text-muted-foreground"
      aria-label="Line colours"
    >
      <span v-for="family in legendFamilies" :key="family" class="flex items-center gap-1.5">
        <span class="inline-block w-5 border-t-2" :style="{ borderColor: `var(${FAMILY_TOKEN[family]})` }" />
        {{ TIE_FAMILY_LABELS[family] }}
      </span>
    </div>

    <!--
      Teleported to <body> because the graph area is overflow-hidden: a tooltip
      drawn inside it is clipped the moment a badge sits near an edge.
    -->
    <Teleport to="body">
      <div
        v-if="hoveredPip"
        ref="pipTooltipRef"
        data-slip
        :style="pipTooltipStyle"
        class="pointer-events-none z-50 rounded-md border border-border bg-popover px-2 py-1 shadow-lg"
      >
        <p class="text-label-lg font-semibold text-foreground">{{ hoveredPip.pip.factionName }}</p>
        <p class="text-caption text-muted-foreground">{{ pipTooltipDetail }}</p>
      </div>
    </Teleport>
  </div>
</template>

<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
import { useDebounceFn } from "@vueuse/core";
import { VNetworkGraph, type EventHandlers, type Layers, type Layouts } from "v-network-graph";
import WorldNodeShape from "@/components/world/WorldNodeShape.vue";
import { useWorldWebGraph, FAMILY_TOKEN } from "@/composables/world/useWorldWebGraph";
import { useWorldWebCamera } from "@/composables/world/useWorldWebCamera";
import { useAnchoredPopover } from "@/composables/useAnchoredPopover";
import { useIsTouch } from "@/composables/useBreakpoint";
import { prefersReducedMotion } from "@/lib/motion";
import { membershipCaption, pipOffsets, type FactionPip, type NodeFactionBadges } from "@/lib/worldWeb/badges";
import { clusterByProximity, convexHull, hullPath, padOutward, type Point } from "@/lib/worldWeb/hull";
import type { RestGraph } from "@/lib/worldWeb/model";
import { TIE_FAMILIES, TIE_FAMILY_LABELS } from "@/lib/worldWeb/ties";

const { graph, badges, group = null, selectedKey = null, connectFrom = null, focalPoints = {} } = defineProps<{
  graph: RestGraph;
  badges: ReadonlyMap<string, NodeFactionBadges>;
  /** The group being drawn: its own node, and the people the hull gathers. */
  group?: { anchor: string; members: ReadonlySet<string> } | null;
  selectedKey?: string | null;
  /** The node a Connect… started from, kept lit while the DM looks for the other end. */
  connectFrom?: string | null;
  /** A PC's portrait crop, by node key. */
  focalPoints?: Record<string, { x: number; y: number }>;
}>();

const emit = defineEmits<{
  node: [key: string];
  edge: [edgeKey: string];
  background: [];
  faction: [factionId: string];
}>();

const { graphNodes, graphEdges, graphConfigs } = useWorldWebGraph({ graph: () => graph, group: () => group });

/** Only the families a line can be, in the order the legend reads. */
const legendFamilies = TIE_FAMILIES.filter((f) => f !== "record");

function imageOf(nodeKey: string): string | null {
  return graph.nodes.get(nodeKey)?.image ?? null;
}

const eventHandlers: EventHandlers = {
  "node:click": ({ node }) => emit("node", node),
  "edge:click": ({ edge }) => { if (edge) emit("edge", edge); },
  "view:click": () => emit("background"),
};

// ── Layout, framing and camera ───────────────────────────────────────────────

/** Node positions, written by the force layout and read by the hull and badge layers. */
const layouts = ref<Layouts>({ nodes: {} });
const graphRef = ref<InstanceType<typeof VNetworkGraph> | null>(null);
const areaEl = ref<HTMLElement | null>(null);
const pointerOver = ref(false);
const cameraTaken = ref(false);
const framed = ref(false);
const zoomLevel = ref(1);

const { spaceHeld, onWheel, onMouseDownCapture, onPointerDown, onPointerMove, onPointerUp } = useWorldWebCamera({
  graph: () => {
    const g = graphRef.value;
    if (!g) return null;
    return {
      panBy: (amount) => g.panBy(amount),
      zoomIn: () => g.zoomIn(),
      zoomOut: () => g.zoomOut(),
      fitToContents: () => g.fitToContents(),
      getZoomLevel: () => zoomLevel.value,
      setZoomLevel: (level) => {
        zoomLevel.value = level;
        return nextTick();
      },
    };
  },
  onTaken: () => { cameraTaken.value = true; },
  setNodesDraggable: (on) => { if (graphConfigs.node) graphConfigs.node.draggable = on; },
  keysActive: () => pointerOver.value || (areaEl.value?.contains(document.activeElement) ?? false),
});

/**
 * `autoPanAndZoomOnLoad: "fit-content"` fits once, before the force simulation
 * has run, so it frames every node stacked at the origin. Refit once positions
 * stop moving, never after the user has touched the camera, and again when what
 * is shown changes.
 */
const frameWhenSettled = useDebounceFn(() => {
  if (framed.value || cameraTaken.value) return;
  framed.value = true;
  graphRef.value?.fitToContents();
}, 400);

watch(layouts, () => { if (!framed.value) void frameWhenSettled(); }, { deep: true });
watch(
  () => Object.keys(graphNodes.value).sort().join(","),
  () => {
    framed.value = false;
    cameraTaken.value = false;
    void frameWhenSettled();
  },
);

/** `node-labels` sits above `nodes`, so badges draw over the shapes; positions are plain graph coordinates. */
const GRAPH_LAYERS: Layers = { groupHull: "base", nodeOverlay: "node-labels" };

// ── The group's hull ─────────────────────────────────────────────────────────

const HULL_PADDING = 34;

/**
 * One shape per run of members who actually sit together, not one round the
 * whole roster: two members on opposite sides of the map would stretch a single
 * hull across everything between them. A lone member gets no shape, since a
 * boundary round one node asserts a group that is not there.
 */
const hullPaths = computed(() => {
  if (!group) return [];
  const points: Point[] = [];
  for (const key of group.members) {
    const pos = layouts.value.nodes[key];
    if (pos && graphNodes.value[key]) points.push({ x: pos.x, y: pos.y });
  }
  return clusterByProximity(points)
    .filter((cluster) => cluster.length > 1)
    .map((cluster) => hullPath(padOutward(convexHull(cluster), HULL_PADDING)));
});

// ── Faction badges ───────────────────────────────────────────────────────────

/**
 * Screen pixels, not graph units: nodes hold a constant screen size however far
 * you zoom, and the layer slot hands out `scale` (1 / zoom), so every size and
 * offset is multiplied by it at the point of use.
 */
const PIP_RADIUS = 9;

const isTouch = useIsTouch();
const hoveredPip = ref<{ pip: FactionPip; el: Element } | null>(null);
const pipTooltipRef = ref<HTMLElement | null>(null);
const { floatingRef: pipFloatingRef, floatingStyle: pipTooltipStyle } = useAnchoredPopover(
  computed(() => hoveredPip.value?.el ?? null),
  computed(() => !!hoveredPip.value),
  () => { hoveredPip.value = null; },
);
watch(pipTooltipRef, (el) => { pipFloatingRef.value = el; });

/** Web Animations is absent in the test DOM, and a reader may have asked for stillness. */
const pipTransition = computed(() => (prefersReducedMotion() ? "none" : "transform 120ms ease-out"));
const pipTooltipDetail = computed(() => (hoveredPip.value ? membershipCaption(hoveredPip.value.pip) : ""));

function isPipOpen(pip: FactionPip): boolean {
  return hoveredPip.value?.pip.factionId === pip.factionId;
}
function onPipEnter(event: PointerEvent, pip: FactionPip) {
  hoveredPip.value = { pip, el: event.currentTarget as Element };
}
function onPipLeave() {
  hoveredPip.value = null;
}
/** On touch the first tap is the hover, so the second follows the badge to its faction. */
function onPipClick(pip: FactionPip) {
  if (isTouch.value && hoveredPip.value?.pip.factionId !== pip.factionId) return;
  emit("faction", pip.factionId);
}

const nodeBadges = computed(() => {
  const out: {
    nodeKey: string;
    cx: number;
    cy: number;
    openScale: number;
    overflow: number;
    overflowDx: number;
    overflowDy: number;
    pips: (FactionPip & { dx: number; dy: number })[];
  }[] = [];

  for (const [nodeKey, node] of Object.entries(graphNodes.value)) {
    const nodeBadge = badges.get(nodeKey);
    if (!nodeBadge?.pips.length) continue;
    const pos = layouts.value.nodes[nodeKey];
    if (!pos) continue;
    const offsets = pipOffsets(nodeBadge.pips.length + (nodeBadge.overflow ? 1 : 0), node.nodeSize, PIP_RADIUS);
    out.push({
      nodeKey,
      cx: pos.x,
      cy: pos.y,
      openScale: node.nodeSize / PIP_RADIUS,
      overflow: nodeBadge.overflow,
      overflowDx: offsets[nodeBadge.pips.length]?.x ?? 0,
      overflowDy: offsets[nodeBadge.pips.length]?.y ?? 0,
      pips: nodeBadge.pips.map((pip, i) => ({ ...pip, dx: offsets[i].x, dy: offsets[i].y })),
    });
  }
  return out;
});
</script>
