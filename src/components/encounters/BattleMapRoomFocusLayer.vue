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

const { hostW, hostH, cellPx, originX, originY, focusCells, zones = [] } = defineProps<{
  hostW: number;
  hostH: number;
  cellPx: number;
  originX: number;
  originY: number;
  /** The focus room's cells, in battle-cell (image-cell) space. */
  focusCells: string[];
  /** Difficult-terrain zones inside the room, cells in the same space. */
  zones?: { battleCells: string[] }[];
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

/** The boundary edges of a set of grid cells, in pixel space — an edge is
 *  drawn wherever a cell's neighbour on that side is NOT in the set, so the
 *  result traces the shape's actual perimeter rather than its bounding box. */
function boundaryEdges(cells: string[]): Edge[] {
  const set = new Set(cells);
  const edges: Edge[] = [];
  const toPx = (cx: number, cy: number): [number, number] => [
    originX + cx * cellPx,
    originY + cy * cellPx,
  ];
  for (const key of cells) {
    const [x, y] = parseCell(key);
    if (!set.has(`${x},${y - 1}`)) {
      const [x1, y1] = toPx(x, y);
      const [x2] = toPx(x + 1, y);
      edges.push({ x1, y1, x2, y2: y1 });
    }
    if (!set.has(`${x},${y + 1}`)) {
      const [x1, y1] = toPx(x, y + 1);
      const [x2] = toPx(x + 1, y + 1);
      edges.push({ x1, y1, x2, y2: y1 });
    }
    if (!set.has(`${x - 1},${y}`)) {
      const [x1, y1] = toPx(x, y);
      const [, y2] = toPx(x, y + 1);
      edges.push({ x1, y1, x2: x1, y2 });
    }
    if (!set.has(`${x + 1},${y}`)) {
      const [x1, y1] = toPx(x + 1, y);
      const [, y2] = toPx(x + 1, y + 1);
      edges.push({ x1, y1, x2: x1, y2 });
    }
  }
  return edges;
}

const roomOutlineEdges = computed(() => boundaryEdges(focusCells));

function zoneOutlineEdges(cells: string[]): Edge[] {
  return boundaryEdges(cells);
}
</script>

<style scoped>
.room-focus-layer {
  position: absolute;
  inset: 0;
  pointer-events: none;
}
</style>
