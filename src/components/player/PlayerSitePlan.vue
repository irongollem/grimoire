<template>
  <svg
    :viewBox="viewBoxAttr"
    preserveAspectRatio="xMidYMid meet"
    class="w-full h-auto rounded-md"
    aria-hidden="true"
  >
    <rect :x="viewBox.minX" :y="viewBox.minY" :width="viewBox.width" :height="viewBox.height" fill="#0b0907" />

    <!-- Floor: only explored cells get one at all — a glimpsed footprint has
         nothing under it, which is the whole point of frame 16. -->
    <rect v-for="(r, i) in floorRects" :key="`floor-${i}`" :x="r.x" :y="r.y" :width="r.w" :height="r.h" fill="#3b332a" />
    <rect
      v-for="(r, i) in textureRects"
      :key="`texture-${i}`"
      :x="r.x + TEXTURE_INSET"
      :y="r.y + TEXTURE_INSET"
      :width="1 - 2 * TEXTURE_INSET"
      :height="1 - 2 * TEXTURE_INSET"
      :rx="TEXTURE_RADIUS"
      fill="#463c31"
      opacity="0.5"
    />
    <rect
      v-for="(r, i) in floorRects"
      :key="`grid-${i}`"
      :x="r.x"
      :y="r.y"
      :width="r.w"
      :height="r.h"
      fill="none"
      stroke="rgba(255,255,255,.10)"
      :stroke-width="GRID_WIDTH"
    />

    <!-- Zones: DM-visible cells only, already clipped to explored ground by
         the RPC — nothing here needs a second clip. -->
    <g v-for="(zone, zi) in zoneLayers" :key="`zone-${zi}`">
      <rect
        v-for="(r, ri) in zone.rects"
        :key="`zone-${zi}-${ri}`"
        :x="r.x"
        :y="r.y"
        :width="r.w"
        :height="r.h"
        :fill="zone.style.fill"
      />
      <path :d="zone.outline" fill="none" :stroke="zone.style.stroke" :stroke-width="ZONE_OUTLINE_WIDTH" :stroke-dasharray="ZONE_DASH" />
    </g>

    <!-- Glimpsed footprints: outline only, no floor, no name — "a room, that way." -->
    <g v-for="(g, gi) in glimpsedLayers" :key="`glimpse-${gi}`">
      <rect
        v-for="(r, ri) in g.rects"
        :key="`glimpse-fill-${gi}-${ri}`"
        :x="r.x"
        :y="r.y"
        :width="r.w"
        :height="r.h"
        fill="rgba(255,255,255,.02)"
      />
      <path :d="g.outline" fill="none" stroke="rgba(180,165,140,.34)" :stroke-width="GLIMPSED_OUTLINE_WIDTH" :stroke-dasharray="GLIMPSED_DASH" />
    </g>

    <path :d="exploredOutline" fill="none" stroke="#8a7a63" :stroke-width="EXPLORED_OUTLINE_WIDTH" stroke-linecap="square" />

    <!-- Doors: only ones the party has stood beside carry an edge key at
         all (see `get_player_visible_site_state`) — a secret, unfound door
         is never in `plan.ways` in the first place. -->
    <line
      v-for="(door, di) in doorSegments"
      :key="`door-${di}`"
      :x1="door.x1"
      :y1="door.y1"
      :x2="door.x2"
      :y2="door.y2"
      stroke="#e7d9bd"
      :stroke-width="door.width"
    />

    <g v-for="space in labeledSpaces" :key="`label-${space.id}`">
      <text
        :x="space.x"
        :y="space.y"
        class="font-cinzel"
        :font-size="NAME_FONT_SIZE"
        font-weight="700"
        fill="#fdf6e6"
        stroke="#0b0907"
        :stroke-width="LABEL_STROKE_WIDTH"
        paint-order="stroke"
        text-anchor="middle"
        dominant-baseline="middle"
      >{{ space.name }}</text>
      <text
        v-if="space.statusLine"
        :x="space.x"
        :y="space.y + STATUS_LINE_OFFSET"
        class="font-fell"
        :font-size="STATUS_FONT_SIZE"
        fill="#c9bfae"
        stroke="#0b0907"
        :stroke-width="LABEL_STROKE_WIDTH"
        paint-order="stroke"
        text-anchor="middle"
        dominant-baseline="middle"
      >{{ space.statusLine }}</text>
    </g>
  </svg>
</template>

<script setup lang="ts">
/**
 * The composed player plan itself (#868 story S9, frame 16 "Fog and player
 * view" of `atlas/Sites & Cartographer.html`). Pure render of a
 * `PlayerSitePlan` document — every pixel comes from `plan.spaces` /
 * `glimpsed` / `ways` / `zones`, never from a baked map image. That is the
 * frame's "one honest limit" closing: the old widget drew the DM's picture
 * and shaded it, which meant everything under the shade — every door, the
 * secret one included, every unexplored wall — sat in the payload whether
 * or not the party had earned it. This component cannot leak that, because
 * it is never sent it.
 *
 * Colours and relative stroke weights are the frame's own `sa-plan.js`
 * `player`-mode values. Its canvas draws at a fixed pixel scale; this SVG
 * has none (`planViewBox` sizes itself to whatever the site's own cells
 * measure), so every width below is expressed as a fraction of one grid
 * cell via `CELL_PX` — a nominal "cell = 40px" reference used only to keep
 * the frame's relative weights (outline 5 vs glimpsed 2 vs door 8) intact
 * at any actual render size, not to reproduce its literal pixel figures.
 *
 * `aria-hidden`: the room list under this component (`PlayerSiteMap.vue`)
 * is the accessible record of the same facts in words; this SVG is a visual
 * supplement to it, not a second source of truth a screen reader needs to
 * parse.
 */
import { computed } from "vue";
import { cellsRects, centroid, edgeSegment, outlinePath, planViewBox, textureCells as pickTextureCells } from "@/lib/locations/planSvg";
import type { PlayerSitePlan } from "@/composables/locations/usePlayerVisibleSiteState";
import type { CellKey } from "@/types/dungeonMap.types";
import type { ZoneKind } from "@/types/locationMapRegion.types";

const { plan } = defineProps<{ plan: PlayerSitePlan }>();

const CELL_PX = 40;
const px = (n: number) => n / CELL_PX;

const GRID_WIDTH = px(1);
const EXPLORED_OUTLINE_WIDTH = px(5);
const GLIMPSED_OUTLINE_WIDTH = px(2);
const GLIMPSED_DASH = `${px(5)} ${px(6)}`;
const ZONE_OUTLINE_WIDTH = px(2.5);
const ZONE_DASH = `${px(7)} ${px(5)}`;
const DOOR_WIDTH = px(8);
const ARCH_WIDTH = px(6);
const TEXTURE_INSET = 0.15;
const TEXTURE_RADIUS = 0.06;
const NAME_FONT_SIZE = px(12.5);
const STATUS_FONT_SIZE = px(9);
const STATUS_LINE_OFFSET = px(15);
const LABEL_STROKE_WIDTH = px(2.5);

const ZONE_STYLES: Record<ZoneKind, { fill: string; stroke: string }> = {
  terrain: { fill: "rgba(56,189,248,.30)", stroke: "rgba(56,189,248,.85)" },
  hazard: { fill: "rgba(251,146,60,.32)", stroke: "rgba(251,146,60,.9)" },
  light: { fill: "rgba(139,92,246,.30)", stroke: "rgba(167,139,250,.9)" },
  trigger: { fill: "rgba(244,63,94,.30)", stroke: "rgba(244,63,94,.9)" },
  marker: { fill: "rgba(120,113,108,.30)", stroke: "rgba(168,162,158,.85)" },
};

/** Every cell any explored space carries, across all its traced shapes. */
const exploredCells = computed<CellKey[]>(() => plan.spaces.flatMap((s) => s.cells));

const viewBox = computed(
  () =>
    planViewBox([exploredCells.value, ...plan.glimpsed.map((g) => g.cells)]) ?? {
      minX: 0,
      minY: 0,
      width: 1,
      height: 1,
    },
);
const viewBoxAttr = computed(() => `${viewBox.value.minX} ${viewBox.value.minY} ${viewBox.value.width} ${viewBox.value.height}`);

const floorRects = computed(() => cellsRects(exploredCells.value));
const textureRects = computed(() => cellsRects(pickTextureCells(exploredCells.value)));
const exploredOutline = computed(() => outlinePath(exploredCells.value));

const glimpsedLayers = computed(() =>
  plan.glimpsed.map((g) => ({
    rects: cellsRects(g.cells),
    outline: outlinePath(g.cells),
  })),
);

const zoneLayers = computed(() =>
  plan.zones.map((zone) => ({
    rects: cellsRects(zone.cells),
    outline: outlinePath(zone.cells),
    style: ZONE_STYLES[zone.zone_kind],
  })),
);

const doorSegments = computed(() =>
  plan.ways
    .filter((way) => way.source_edge_key !== null)
    .map((way) => {
      const seg = edgeSegment(way.source_edge_key!);
      return { ...seg, width: way.door_kind === "arch" ? ARCH_WIDTH : DOOR_WIDTH };
    }),
);

/** One label per room, at the centroid of all its traced shapes combined —
 *  a room split across several shapes still gets exactly one name. */
const labeledSpaces = computed(() => {
  const byId = new Map<string, { name: string; cells: CellKey[]; isCleared: boolean; isLooted: boolean }>();
  for (const space of plan.spaces) {
    const existing = byId.get(space.space_location_id);
    if (existing) existing.cells.push(...space.cells);
    else byId.set(space.space_location_id, { name: space.name, cells: [...space.cells], isCleared: space.is_cleared, isLooted: space.is_looted });
  }
  return [...byId.entries()].map(([id, room]) => {
    const [x, y] = centroid(room.cells) ?? [0, 0];
    const statusLine =
      room.isCleared && room.isLooted ? "Cleared · Looted" : room.isCleared ? "Cleared" : room.isLooted ? "Looted" : null;
    return { id, name: room.name, x, y, statusLine };
  });
});
</script>
