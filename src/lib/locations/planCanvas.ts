// The site map overlay's own render passes (#868 wave 2, split out of
// `MapRegionsLayer.vue` to keep that file under the 600-line soft max once
// doors, zones and the pen tool all landed on the same canvas).
//
// Every function here is a pure `(ctx, geometry, data) => void` — no Vue, no
// refs, nothing read off a component. `MapRegionsLayer.vue` keeps the state
// (the in-flight paint stroke, the pen drag, pointer handling) and calls
// these in the same order its old inline `renderOverlay` did; the pass order
// itself is load-bearing (grid under spaces under ways under zones under the
// pen/template overlay), so a caller composes them rather than this module
// picking an order for them.

import { cellRectInImageFractions, gridExtent } from "@/lib/locations/gridCalibration";
import { edgeSegment } from "@/lib/locations/planSvg";
import { ZONE_KIND_FILL } from "@/lib/locations/zones";
import { cellFractionSize, isNearFirstNode } from "@/composables/locations/useRegionPen";
import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import type { GridCalibration } from "@/types/location.types";
import { ZONE_KIND_LABELS, type GridPoint, type LocationMapRegion } from "@/types/locationMapRegion.types";

/** The image + canvas facts every pass needs to turn a cell key or grid point
 *  into canvas pixels — the same values `MapRegionsLayer.vue`'s `renderOverlay`
 *  already had in scope, bundled so each pass takes one object instead of
 *  four positional numbers apiece. */
export interface RenderGeometry {
  calibration: GridCalibration;
  imageWidth: number;
  imageHeight: number;
  canvasWidth: number;
  canvasHeight: number;
}

type PointToCanvas = (point: GridPoint) => { x: number; y: number };

// ── Grid pass ────────────────────────────────────────────────────────────

/** The faint cell grid under everything else. A no-op on a degenerate
 *  calibration/image — same guard `gridExtent` itself already encodes. */
export function drawGridPass(ctx: CanvasRenderingContext2D, geometry: RenderGeometry): void {
  const { calibration: cal, imageWidth: w, imageHeight: h, canvasWidth, canvasHeight } = geometry;
  const { cols, rows } = gridExtent(cal, w, h);
  if (cols <= 0 || rows <= 0) return;

  const originCellX = cal.origin_cell_x ?? 0;
  const originCellY = cal.origin_cell_y ?? 0;

  ctx.strokeStyle = "rgba(255, 255, 255, 0.12)";
  ctx.lineWidth = 1;
  ctx.beginPath();
  for (let ix = 0; ix <= cols; ix++) {
    const rect = cellRectInImageFractions(cellKey(ix + originCellX, originCellY), cal, w, h);
    const px = rect.x * canvasWidth;
    ctx.moveTo(px, 0);
    ctx.lineTo(px, canvasHeight);
  }
  for (let iy = 0; iy <= rows; iy++) {
    const rect = cellRectInImageFractions(cellKey(originCellX, iy + originCellY), cal, w, h);
    const py = rect.y * canvasHeight;
    ctx.moveTo(0, py);
    ctx.lineTo(canvasWidth, py);
  }
  ctx.stroke();
}

// ── Spaces pass ──────────────────────────────────────────────────────────

export type SpaceMode = "browse" | "run";

/** Browse mode's palette: active-for-tracing blue, bound green, unbound
 *  amber. Run mode repurposes the same three slots for what a DM asks
 *  mid-session: party (blue), reachable (green), locked (stone grey rather
 *  than amber, so it doesn't read as "look here"), untraced nearly invisible. */
export interface SpacePaletteOptions {
  mode: SpaceMode;
  activeRegionId: string | null;
  /** The room the party currently occupies. Only meaningful in run mode. */
  partyRoomId: string | null;
  /** `null` means "nothing to be unreachable from yet" — every bound region
   *  renders as reachable. Only meaningful in run mode. */
  reachableRoomIds: ReadonlySet<string> | null;
  /** A bound space's durable world-state facts (#868, frame 01) — browse
   *  mode only; run mode keeps its own palette above. Keyed by space id;
   *  absent, or no entry for this space, falls back to the plain bound green
   *  a site with nothing asserted yet has always shown. */
  roomState?: ReadonlyMap<string, RoomFacts>;
}

/** The three durable facts a room can carry (`location_state`'s own
 *  `explored`/`cleared`/`looted`), reduced to plain booleans for shading —
 *  missing-vs-false is a distinction this palette has no visual for. */
export interface RoomFacts {
  explored: boolean;
  cleared: boolean;
  looted: boolean;
}

/** The four tints a bound space takes on in browse mode once the DM has
 *  asserted anything about it — frame 01: "those three facts now shade the
 *  space on the plan, so 'what is left of this dungeon' is a glance rather
 *  than a list." The same palette the player's own plan used before #868,
 *  reused here (and by `SiteMapLegend`) so the two never drift apart. */
export const ROOM_FACT_COLORS = {
  clearedAndLooted: "rgba(167, 139, 250, 0.34)",
  cleared: "rgba(74, 222, 128, 0.32)",
  looted: "rgba(217, 158, 44, 0.32)",
  exploredOnly: "rgba(148, 163, 184, 0.28)",
} as const;

/** `null` when the room has no facts at all yet — the caller falls back to
 *  the plain bound green in that case, same as before this landed. */
function roomFactFillColor(facts: RoomFacts | undefined): string | null {
  if (!facts) return null;
  if (facts.cleared && facts.looted) return ROOM_FACT_COLORS.clearedAndLooted;
  if (facts.cleared) return ROOM_FACT_COLORS.cleared;
  if (facts.looted) return ROOM_FACT_COLORS.looted;
  if (facts.explored) return ROOM_FACT_COLORS.exploredOnly;
  return null;
}

export function regionFillColor(region: LocationMapRegion, opts: SpacePaletteOptions): string {
  const { mode, activeRegionId, partyRoomId, reachableRoomIds, roomState } = opts;
  if (mode === "run") {
    // `partyRoomId` guarded first: both sides are nullable, and a party that
    // has not entered a room yet is null on one side while every *unbound*
    // region is null on the other — comparing them raw would light up every
    // untraced shape in party-blue at once.
    if (partyRoomId !== null && region.space_location_id === partyRoomId) return "rgba(96, 165, 250, 0.55)";
    if (!region.space_location_id) return "rgba(255, 255, 255, 0.04)";
    const reachable = !reachableRoomIds || reachableRoomIds.has(region.space_location_id);
    return reachable ? "rgba(74, 222, 128, 0.28)" : "rgba(120, 113, 108, 0.35)";
  }
  if (region.id === activeRegionId) return "rgba(96, 165, 250, 0.45)";
  if (!region.space_location_id) return "rgba(251, 191, 36, 0.28)";
  return roomFactFillColor(roomState?.get(region.space_location_id)) ?? "rgba(74, 222, 128, 0.28)";
}

/**
 * Fills every `space` region, strokes the active/party-occupied one, and lays
 * a pen-traced region's true polygon outline over its stepped cell fill
 * (#868 Build step 4: "in every mode" — not just while it's being edited).
 *
 * `cellsOverride` stands in for a region's own `cells` while a paint stroke
 * or a just-committed one is still in flight — the caller (an in-progress
 * drag, or the cache-lag window before a refetch lands) decides that, this
 * pass only ever draws whichever cell list it's handed.
 */
export function drawSpacesPass(
  ctx: CanvasRenderingContext2D,
  geometry: RenderGeometry,
  regions: readonly LocationMapRegion[],
  opts: SpacePaletteOptions,
  pointToCanvas: PointToCanvas,
  cellsOverride?: ReadonlyMap<string, readonly CellKey[]>,
): void {
  const { calibration: cal, imageWidth: w, imageHeight: h, canvasWidth, canvasHeight } = geometry;

  for (const region of regions) {
    if (region.region_role !== "space") continue;
    const cells = cellsOverride?.get(region.id) ?? region.cells;

    // Same null-versus-null trap as `regionFillColor` — the outline has to
    // agree with the fill, or an unbound shape gets a party ring around a
    // colour that says it is untraced.
    const isHighlighted =
      opts.mode === "run"
        ? opts.partyRoomId !== null && region.space_location_id === opts.partyRoomId
        : region.id === opts.activeRegionId;

    ctx.fillStyle = regionFillColor(region, opts);
    for (const key of cells) {
      const rect = cellRectInImageFractions(key, cal, w, h);
      ctx.fillRect(rect.x * canvasWidth, rect.y * canvasHeight, rect.w * canvasWidth, rect.h * canvasHeight);
    }

    if (isHighlighted) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      for (const key of cells) {
        const rect = cellRectInImageFractions(key, cal, w, h);
        const x = rect.x * canvasWidth;
        const y = rect.y * canvasHeight;
        const cw = rect.w * canvasWidth;
        const ch = rect.h * canvasHeight;
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
      }
    }

    if (region.vertices) {
      // A pen-traced region always shows its own polygon outline, not the
      // stepped cell boundary — otherwise a diagonal wall (the Nave's apse,
      // frame 12) reads as a staircase of cell corners.
      drawPersistedRingOutline(ctx, pointToCanvas, region.vertices);
    }
  }
}

// ── Ways pass (doors, arches, stairs) ───────────────────────────────────

export interface WayLike {
  source_edge_key: SourceEdgeKey | null;
  door_kind: DoorKind;
  starts_locked: boolean;
  is_secret: boolean;
}

/**
 * Doors on the plan (#868, frame 03) — a bar across the door's own cell edge,
 * only for doors published with one (`source_edge_key`). Colour precedence
 * mirrors `sa-plan.js`: a secret door's violet dash wins over a locked door's
 * amber, which wins over an arch's plain brown, because the rarer, more
 * consequential fact is the one a DM's eye should catch first.
 */
export function drawWaysPass(
  ctx: CanvasRenderingContext2D,
  geometry: RenderGeometry,
  ways: readonly WayLike[],
  pointToCanvas: PointToCanvas,
): void {
  const { calibration: cal, imageWidth: w, imageHeight: h, canvasWidth } = geometry;

  for (const way of ways) {
    if (!way.source_edge_key) continue;
    const isArch = way.door_kind === "arch";
    const size = cellFractionSize(cal, w, h);
    const cellPxWidth = size ? size.cellWFrac * canvasWidth : 0;
    if (cellPxWidth <= 0) continue;

    // sa-plan.js's own convention: an 8-unit-thick bar (6 for an arch) on a
    // 100-unit cell, inset 5 units from the cell corners so the bar reads as
    // a gap in the wall rather than a full wall-length stroke.
    const lineWidth = Math.max(1, (isArch ? 0.06 : 0.08) * cellPxWidth);
    const seg = edgeSegment(way.source_edge_key, 0.05);
    const p1 = pointToCanvas([seg.x1, seg.y1]);
    const p2 = pointToCanvas([seg.x2, seg.y2]);

    ctx.strokeStyle = way.is_secret ? "#a78bfa" : way.starts_locked ? "#fbbf24" : isArch ? "#6b5c47" : "#e7d9bd";
    ctx.lineWidth = lineWidth;
    ctx.lineCap = "butt";
    if (way.is_secret) ctx.setLineDash([lineWidth * 0.75, lineWidth * 0.5]);
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.stroke();
    if (way.is_secret) ctx.setLineDash([]);
  }
}

// ── Zones pass ───────────────────────────────────────────────────────────

/**
 * Zones paint above spaces — a room is a floor to stand on, a zone is an
 * overlay ON that floor (water, ash, darkness) — and always dashed, so a
 * zone reads as an area effect rather than a second, competing room shape
 * (frame 07: "Zone layer over the space layer — dashed, so a zone never
 * reads as a room.").
 */
export function drawZonesPass(
  ctx: CanvasRenderingContext2D,
  geometry: RenderGeometry,
  regions: readonly LocationMapRegion[],
  activeRegionId: string | null,
  dpr: number,
  cellsOverride?: ReadonlyMap<string, readonly CellKey[]>,
): void {
  const { calibration: cal, imageWidth: w, imageHeight: h, canvasWidth, canvasHeight } = geometry;

  for (const region of regions) {
    if (region.region_role !== "zone" || !region.zone_kind) continue;
    const cells = cellsOverride?.get(region.id) ?? region.cells;
    const { fill, stroke: strokeColor } = ZONE_KIND_FILL[region.zone_kind];

    ctx.fillStyle = fill;
    for (const key of cells) {
      const rect = cellRectInImageFractions(key, cal, w, h);
      ctx.fillRect(rect.x * canvasWidth, rect.y * canvasHeight, rect.w * canvasWidth, rect.h * canvasHeight);
    }

    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([7, 5]);
    for (const key of cells) {
      const rect = cellRectInImageFractions(key, cal, w, h);
      ctx.strokeRect(rect.x * canvasWidth, rect.y * canvasHeight, rect.w * canvasWidth, rect.h * canvasHeight);
    }
    ctx.setLineDash([]);

    if (region.id === activeRegionId) {
      ctx.strokeStyle = "rgba(96, 165, 250, 0.9)";
      ctx.lineWidth = 2;
      for (const key of cells) {
        const rect = cellRectInImageFractions(key, cal, w, h);
        const x = rect.x * canvasWidth;
        const y = rect.y * canvasHeight;
        const cw = rect.w * canvasWidth;
        const ch = rect.h * canvasHeight;
        ctx.strokeRect(x + 1, y + 1, cw - 2, ch - 2);
      }
    }

    if (cells.length) {
      let sx = 0;
      let sy = 0;
      for (const key of cells) {
        const rect = cellRectInImageFractions(key, cal, w, h);
        sx += (rect.x + rect.w / 2) * canvasWidth;
        sy += (rect.y + rect.h / 2) * canvasHeight;
      }
      const label = (region.label || ZONE_KIND_LABELS[region.zone_kind]).toUpperCase();
      ctx.font = `${Math.round(9 * dpr)}px ui-sans-serif, system-ui, sans-serif`;
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillStyle = strokeColor;
      ctx.fillText(label, sx / cells.length, sy / cells.length);
    }
  }
}

// ── Pen / template overlay (#868, frame 12) ──────────────────────────────
// Moved from `useRegionPen.ts` (#868 wave 2): these three are pure canvas
// drawing, not pen/template *state* — the composable at that path keeps the
// reducers and the reactive wrapper `MapRegionsLayer.vue` holds, this module
// keeps everything that touches a `CanvasRenderingContext2D`.

/** Draws whichever ring the pen tool is showing right now — the unsaved
 *  draft (open, blue) or an already-persisted region (closed, green) — plus
 *  its rubber-band to the cursor and its square nodes, gold on the first one
 *  when a click there would close the ring (frame 12). */
export function drawPenOverlay(
  ctx: CanvasRenderingContext2D,
  pointToCanvas: PointToCanvas,
  ring: readonly GridPoint[],
  closed: boolean,
  hoverPoint: GridPoint | null,
  nodeSizePx: number,
  snapHitRadiusCells: number,
): void {
  if (ring.length >= 2) {
    const pts = ring.map(pointToCanvas);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    if (closed) ctx.closePath();
    ctx.fillStyle = closed ? "rgba(74, 222, 128, 0.28)" : "rgba(96, 165, 250, 0.22)";
    if (closed) ctx.fill();
    ctx.strokeStyle = closed ? "rgba(74, 222, 128, 0.8)" : "rgba(96, 165, 250, 0.9)";
    ctx.lineWidth = 2;
    ctx.stroke();
  }

  // The rubber-band from the last placed node to the snapped cursor — only
  // meaningful while the ring is still open (frame 12: "click the first node
  // to close").
  if (!closed && ring.length > 0 && hoverPoint) {
    const last = pointToCanvas(ring[ring.length - 1]);
    const cursor = pointToCanvas(hoverPoint);
    ctx.beginPath();
    ctx.moveTo(last.x, last.y);
    ctx.lineTo(cursor.x, cursor.y);
    ctx.strokeStyle = "rgba(96, 165, 250, 0.7)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 4]);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  const nearFirst = !closed && hoverPoint ? isNearFirstNode(ring, hoverPoint[0], hoverPoint[1], snapHitRadiusCells) : false;
  ring.map(pointToCanvas).forEach((p, i) => {
    const gold = i === 0 && nearFirst;
    ctx.fillStyle = gold ? "#fbbf24" : "#faf3e2";
    ctx.strokeStyle = gold ? "#fbbf24" : "#1d4ed8";
    ctx.lineWidth = 1.5;
    ctx.fillRect(p.x - nodeSizePx / 2, p.y - nodeSizePx / 2, nodeSizePx, nodeSizePx);
    ctx.strokeRect(p.x - nodeSizePx / 2, p.y - nodeSizePx / 2, nodeSizePx, nodeSizePx);
  });
}

/** The live preview while dragging a template out — "dropped in one drag"
 *  (frame 12). A no-op ring (radius not yet past 0) draws nothing. */
export function drawTemplatePreview(ctx: CanvasRenderingContext2D, pointToCanvas: PointToCanvas, ring: readonly GridPoint[]): void {
  if (ring.length === 0) return;
  const pts = ring.map(pointToCanvas);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.fillStyle = "rgba(167, 139, 250, 0.22)";
  ctx.fill();
  ctx.strokeStyle = "rgba(167, 139, 250, 0.85)";
  ctx.lineWidth = 2;
  ctx.stroke();
}

/** A pen-traced region's own polygon outline, drawn over its cell fill so a
 *  diagonal edge reads in every mode, not just while it's being edited
 *  (#868 Build step 4). */
export function drawPersistedRingOutline(ctx: CanvasRenderingContext2D, pointToCanvas: PointToCanvas, vertices: readonly GridPoint[]): void {
  const pts = vertices.map(pointToCanvas);
  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);
  for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  ctx.closePath();
  ctx.strokeStyle = "rgba(74, 222, 128, 0.8)";
  ctx.lineWidth = 2;
  ctx.stroke();
}
