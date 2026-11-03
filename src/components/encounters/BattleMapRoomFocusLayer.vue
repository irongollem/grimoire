<template>
  <svg
    v-if="focusCells.length > 0"
    class="room-focus-layer"
    :width="hostW"
    :height="hostH"
    :viewBox="`0 0 ${hostW} ${hostH}`"
  >
    <!-- The whole plan, dimmed outside the focus room (frame 13: "the whole
         plan dimmed ... outside the focus room, even-odd"). One path: the
         full viewport, plus one hole per focus cell. -->
    <path :d="dimPathD" fill="rgba(10, 8, 6, 0.74)" fill-rule="evenodd" />

    <!-- The focus room's own outline, traced from its cells' boundary edges
         rather than a bounding box, so an L-shaped room reads as L-shaped. -->
    <line
      v-for="(e, i) in roomOutlineEdges"
      :key="`room-${i}`"
      :x1="e.x1"
      :y1="e.y1"
      :x2="e.x2"
      :y2="e.y2"
      stroke="rgba(96, 165, 250, 0.85)"
      stroke-width="2"
      stroke-linecap="round"
    />

    <!-- Says what the outline is (decision 8): a quiet chip on the room's top edge, not a banner. -->
    <g v-if="label && labelAnchor" class="room-focus-label" data-testid="room-focus-label">
      <rect :x="labelAnchor.x" :y="labelAnchor.y" :width="labelWidth" height="18" rx="4" />
      <text :x="labelAnchor.x + 7" :y="labelAnchor.y + 13">{{ label }}</text>
    </g>

    <!-- Difficult-terrain zones inside the room: a read, not an enforcement —
         "it does not halve anyone's speed" (frame 13). -->
    <template v-for="(zone, zi) in zones" :key="`zone-${zi}`">
      <line
        v-for="(e, ei) in zoneOutlineEdges(zone.battleCells)"
        :key="`zone-${zi}-${ei}`"
        :x1="e.x1"
        :y1="e.y1"
        :x2="e.x2"
        :y2="e.y2"
        stroke="rgba(34, 211, 238, 0.9)"
        stroke-width="1.5"
        stroke-dasharray="6 4"
      />
    </template>
  </svg>
</template>

<script setup lang="ts">
import { computed } from "vue";
import { cellOutline } from "@/lib/battlemap/cellOutline";

const { hostW, hostH, cellPx, originX, originY, focusCells, zones = [], label = null } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  /** The focus room's cells, in battle-cell (image-cell) space. */
  focusCells: string[];
  /** Difficult-terrain zones inside the room, cells in the same space. */
  zones?: { battleCells: string[] }[];
  /** What the outline is called on screen ("Fight here"); null for no chip. */
  label?: string | null;
}>();

function parseCell(key: string): [number, number] {
  const [x, y] = key.split(",");
  return [Number(x), Number(y)];
}

/** Full-viewport rect plus one square hole per focus cell — an even-odd path
 *  dims everything except the cells actually in the room. */
const dimPathD = computed(() => {
  const outer = `M0,0 H${hostW} V${hostH} H0 Z`;
  const holes = focusCells
    .map((key) => {
      const [cx, cy] = parseCell(key);
      const x = originX + cx * cellPx;
      const y = originY + cy * cellPx;
      return `M${x},${y} H${x + cellPx} V${y + cellPx} H${x} Z`;
    })
    .join(" ");
  return holes ? `${outer} ${holes}` : outer;
});

interface Edge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The boundary edges of a set of grid cells in pixel space: the perimeter of the shape, not its bounding box. */
function boundaryEdges(cells: string[]): Edge[] {
  return cellOutline(cells).map((e) => ({
    x1: originX + e.x1 * cellPx,
    y1: originY + e.y1 * cellPx,
    x2: originX + e.x2 * cellPx,
    y2: originY + e.y2 * cellPx,
  }));
}

const roomOutlineEdges = computed(() => boundaryEdges(focusCells));

/** The chip sits just inside the room's top-left corner, so it never leaves the lit room nor covers the dimmed plan. */
const labelAnchor = computed(() => {
  if (focusCells.length === 0) return null;
  const parsed = focusCells.map(parseCell);
  const top = Math.min(...parsed.map(([, y]) => y));
  const left = Math.min(...parsed.filter(([, y]) => y === top).map(([x]) => x));
  return { x: originX + left * cellPx + 4, y: originY + top * cellPx + 4 };
});
// Monospace-ish estimate: the chip is SVG text, which cannot size its own rect.
const labelWidth = computed(() => (label ? label.length * 6.4 + 14 : 0));

function zoneOutlineEdges(cells: string[]): Edge[] {
  return boundaryEdges(cells);
}
</script>

<style scoped>
.room-focus-label rect {
  fill: rgba(10, 8, 6, 0.82);
  stroke: rgba(96, 165, 250, 0.85);
  stroke-width: 1px;
}
.room-focus-label text {
  fill: rgb(191, 219, 254);
  font-size: 0.6875rem;
  letter-spacing: 0.04em;
  font-weight: 600;
}
.room-focus-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
