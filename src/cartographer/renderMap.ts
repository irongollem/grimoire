// Canvas rendering for the cartographer map editor.
//
// Pulled out of CartographerEditorView.vue's `render()` so the drawing logic
// can be exercised without a live <canvas> or Vue reactivity. `renderMap`
// receives plain values only — never Vue refs — so it must not import from
// "vue". The view stays responsible for reading its refs each frame and
// building the `MapRenderScene`.

import type { PackCategory } from "@/cartographer/packSchema";
import { drawMapContent, offscreenMakeCanvas, renderShadowLayer } from "@/cartographer/drawMap";
import { gatherLightSources, newLightMaskCache, renderLightLayer } from "@/cartographer/drawLights";
import type { DrawMapInput, MakeCanvas, ShadowLayer } from "@/cartographer/drawFrame";
import type { LightMaskCache } from "@/cartographer/lightMask";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { paintLitVeil } from "@/lib/battlemap/darkness";
import { AMBIENT, illuminationGrid } from "@/lib/battlemap/illumination";
import { occluders } from "@/lib/battlemap/occlusion";
import { collectOcclusion } from "@/cartographer/mapOcclusion";
import { paintEditorMarks, type EditorMarks } from "@/cartographer/drawEditorMarks";
import { cellKey, type CellKey, type DarknessLevel, type DungeonMapLayers, type CellMetadata, type DressingPlacement } from "@/types/dungeonMap.types";
import type { CellEdge } from "@/cartographer/edges";
import type { Tool } from "@/cartographer/tools";
import {
  dressingCellBounds,
  drawDressing,
  dressingFootprint,
  strokeDressingOutline,
  type DressingCatalog,
} from "@/cartographer/dressing";

export interface MapRenderScene {
  ctx: CanvasRenderingContext2D;
  canvasWidth: number;
  canvasHeight: number;
  tilePx: number;
  viewportOffset: { x: number; y: number };
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: DungeonMapLayers;
  metadata: Record<CellKey, CellMetadata>;
  /**
   * Per-cell PackCategory for a placed trap/feature's glyph (#804), resolved
   * OUTSIDE this function from the linked entity's live hazard_glyph /
   * feature_glyph — see cartographer/glyphs.ts. This stays a plain resolved
   * value rather than raw trap/feature data so renderMap keeps taking only
   * plain values, same rule as everything else on this scene.
   */
  glyphs: Record<CellKey, PackCategory>;
  runtimes: Map<string, TilePackRuntime>;
  fallbackRuntime: TilePackRuntime | null;
  /**
   * Active pack id, used as the last-resort fallback when resolving which
   * pack owns a corner joint (see the wallJoint fallback below). render()
   * reads this once via `currentPackId.value` — it isn't part of the
   * "interaction state" fields but the drawn output depends on it, so it
   * has to travel with the rest of the scene.
   */
  currentPackId: string;
  /** The map's ambient light; the DM's veil for it is laid over the drawing (absent = daylight). */
  darkness?: DarknessLevel;
  // Interaction state render() reads — same types the view already declares
  // for these refs.
  activeTool: Tool;
  viewMode: boolean;
  hoveredEdge: CellEdge | null;
  hoverCell: [number, number] | null;
  /** Round brush cursor, in fractional cells; radius in cells; dashed when erasing (Alt). Only set while the Brush is active. */
  brushPreview?: { x: number; y: number; radius: number; erase: boolean } | null;
  selectedCell: [number, number] | null;
  previewCells: Set<CellKey>;
  /**
   * A site's Picture layer, shown as a ghost reference beneath everything
   * else (epic #884 S6 — MapWorkbench embedded in the Atlas). Positioning is
   * computed by the caller from the site's `grid_calibration` against this
   * frame's own `tilePx`/`viewportOffset` — this function only draws it, the
   * same "plain values in" rule as every other field here. Absent for the
   * standalone `/cartographer/:id` route, which passes no site.
   */
  referenceImage?: MapRenderReferenceImage | null;
  /** Opacity of the white square grid, or null to leave it off (the editor's Grid switch). */
  gridAlpha: number | null;
  /** Dressing props by id (epic #1062), with whatever art has loaded so far. */
  dressing: DressingCatalog;
  /** A prop being placed or dragged, drawn translucent above the map. */
  dressingGhost?: { placement: DressingPlacement; alpha: number } | null;
  /** The selected placement, outlined. */
  selectedDressingId?: string | null;
  /** The Angled wall run, the selected wall and the placed lights, drawn over the map (#1125 story 5). */
  editorMarks?: EditorMarks;
  /**
   * Bumps on every edit of `layers` (the editor's `editRevision`). The editor
   * paints INTO the same `layers` object, so its identity cannot tell the
   * shadow cache that the map changed; this can. Absent means the caller cannot
   * say, and the shadows are then rebuilt every frame rather than risk showing
   * a stale one.
   */
  layersRevision?: number;
  /**
   * Leave out what the live layer draws itself (swaying props, door leaves); see `omitLive` on `DrawMapInput`. Set
   * while the editor plays motion over the map, so a prop is never drawn twice and the darkness veil is left to the animated one above.
   */
  omitLive?: boolean;
  /**
   * Which half of the map to draw (#1125 frames 16-17). The battle map puts its live water between the ground and
   * what stands, so while motion plays the editor draws two canvases the same way: `ground` is the background, the
   * base image and the ground, nothing else; `standing` is transparent and holds what stands on the ground; `aids` is
   * transparent and holds every editing aid (labels, selection, wall nodes, the brush footprint, hover marks), stacked
   * above the animated darkness veil so an aid is never dimmed by it. Absent draws the whole map on one canvas.
   */
  pass?: "ground" | "standing" | "aids";
  /** Canvas factory for the shadow layers; defaults to OffscreenCanvas where it exists. Tests pass a fake. */
  makeCanvas?: MakeCanvas;
}

export interface MapRenderReferenceImage {
  source: CanvasImageSource;
  /** Canvas-pixel (device-pixel, same space as `tilePx`) position of the
   *  image's own top-left pixel. */
  x: number;
  y: number;
  width: number;
  height: number;
  /** 0..1 — kept low so the reference reads as a trace-beneath, not a second drawing. */
  opacity: number;
}

// ── Shadow cache ───────────────────────────────────────────────────────────
// Shadows are blurred silhouettes of the whole window, and this function runs
// on every hover and mouse move, so they are rendered once and reused. The key
// is everything the layer's pixels depend on and nothing the interaction state
// touches: hover, selection and previews are not in it.

interface ShadowKey {
  layers: DungeonMapLayers;
  revision: number;
  dressing: DressingCatalog;
  runtimes: TilePackRuntime[];
  fallback: TilePackRuntime | null;
  currentPackId: string;
  /** Pixels a cell the layer is built at: a power of two, so zooming rebuilds it once an octave, not once a step. */
  scale: number;
}

/** The cells a layer is built over, and the layer, at `key.scale` px a cell with cell (0,0) at its pixel (0,0). */
interface LayerCache {
  key: ShadowKey;
  layer: ShadowLayer | null;
}

let shadowCache: LayerCache | null = null;
let lightCache: LayerCache | null = null;
let maskCache: { layers: DungeonMapLayers; revision: number; masks: LightMaskCache } | null = null;

/** Light masks live per edit revision, not per zoom or window: a pan re-composites them, an edit rebuilds them. */
function lightMasksFor(scene: MapRenderScene): LightMaskCache | undefined {
  if (scene.layersRevision === undefined) return undefined;
  if (!maskCache || maskCache.layers !== scene.layers || maskCache.revision !== scene.layersRevision) {
    maskCache = { layers: scene.layers, revision: scene.layersRevision, masks: newLightMaskCache(scene.layers) };
  }
  return maskCache.masks;
}

function sameShadowKey(a: ShadowKey, b: ShadowKey): boolean {
  return (
    a.layers === b.layers &&
    a.revision === b.revision &&
    a.dressing === b.dressing &&
    a.fallback === b.fallback &&
    a.currentPackId === b.currentPackId &&
    a.scale === b.scale &&
    a.runtimes.length === b.runtimes.length &&
    a.runtimes.every((r, i) => r === b.runtimes[i])
  );
}

// The shadow and glow layers are soft (blurred silhouettes, masked gradients), so they are built once over the whole
// drawing at a modest scale and scaled onto the screen: a pan only moves them and a zoom inside the same octave only
// stretches them. They used to be built over the window at full resolution, keyed on the pan, so every step of a pan
// re-blurred the map (about 30 ms a frame at 128 px a cell).
const LAYER_MAX_PX_PER_CELL = 64;
const LAYER_MIN_PX_PER_CELL = 4;
/** The longest side a layer may have; a sprawling drawing is built coarser instead. */
const LAYER_MAX_PX = 4096;
/** Cells around the drawing a layer also covers: a wall's shadow falls past the last floor. */
const LAYER_MARGIN = 1;

/** The scale a layer is built at for `tilePx`: the next power of two up, within limits, coarser for a huge drawing. */
export function layerScale(tilePx: number, extentCells: number): number {
  let q = Math.min(LAYER_MAX_PX_PER_CELL, Math.max(LAYER_MIN_PX_PER_CELL, 2 ** Math.ceil(Math.log2(Math.max(1, tilePx)))));
  while (q > LAYER_MIN_PX_PER_CELL && extentCells * q > LAYER_MAX_PX) q /= 2;
  return q;
}

/** The cells everything drawn covers (floor, walls, props), or null for an empty drawing. */
export function drawnExtent(layers: DungeonMapLayers, dressing: DressingCatalog): { minX: number; minY: number; maxX: number; maxY: number } | null {
  const painted = paintedExtent(layers);
  let out = painted ? { ...painted } : null;
  const grow = (x0: number, y0: number, x1: number, y1: number) => {
    if (!out) out = { minX: x0, minY: y0, maxX: x1, maxY: y1 };
    else {
      out.minX = Math.min(out.minX, x0);
      out.minY = Math.min(out.minY, y0);
      out.maxX = Math.max(out.maxX, x1);
      out.maxY = Math.max(out.maxY, y1);
    }
  };
  for (const w of Object.values(layers.walls)) {
    grow(Math.floor(Math.min(w.a[0], w.b[0])), Math.floor(Math.min(w.a[1], w.b[1])), Math.ceil(Math.max(w.a[0], w.b[0])), Math.ceil(Math.max(w.a[1], w.b[1])));
  }
  for (const placement of Object.values(layers.dressing)) {
    const b = dressingCellBounds(placement, dressing);
    grow(b.minX, b.minY, b.maxX, b.maxY);
  }
  return out;
}

/**
 * A soft layer (shadows, the masked light glow) for this frame: built over the whole drawing at `layerScale` and
 * rebuilt only when the edit revision, the loaded packs or the scale change, so hovering and panning never re-blur the
 * map or re-walk every light's lines of sight. Returned placed on the screen. A caller that cannot name a revision
 * gets a fresh build each frame rather than a stale one.
 */
function cachedLayer(
  slot: "shadow" | "light",
  scene: MapRenderScene,
  input: DrawMapInput,
  build: (input: DrawMapInput) => ShadowLayer | null,
): ShadowLayer | null {
  if (!input.makeCanvas) return null;
  if (scene.layersRevision === undefined) return build(input);
  const extent = drawnExtent(scene.layers, scene.dressing);
  if (!extent) return null;
  const bounds = {
    minX: extent.minX - LAYER_MARGIN,
    minY: extent.minY - LAYER_MARGIN,
    maxX: extent.maxX + LAYER_MARGIN,
    maxY: extent.maxY + LAYER_MARGIN,
  };
  const scale = layerScale(scene.tilePx, Math.max(bounds.maxX - bounds.minX + 1, bounds.maxY - bounds.minY + 1));
  const key: ShadowKey = {
    layers: scene.layers,
    revision: scene.layersRevision,
    dressing: scene.dressing,
    runtimes: [...scene.runtimes.values()],
    fallback: scene.fallbackRuntime,
    currentPackId: scene.currentPackId,
    scale,
  };
  const held = slot === "shadow" ? shadowCache : lightCache;
  let layer: ShadowLayer | null;
  if (held && sameShadowKey(held.key, key)) layer = held.layer;
  else {
    layer = build({ ...input, tilePx: scale, origin: { x: 0, y: 0 }, bounds });
    if (slot === "shadow") shadowCache = { key, layer };
    else lightCache = { key, layer };
  }
  if (!layer) return null;
  const k = scene.tilePx / scale;
  return {
    canvas: layer.canvas,
    left: layer.left * k - scene.viewportOffset.x,
    top: layer.top * k - scene.viewportOffset.y,
    width: layer.width * k,
    height: layer.height * k,
  };
}

// ── Illumination cache ─────────────────────────────────────────────────────
// The light level over the painted area depends on the map's content and its darkness, not on zoom, pan or hover, so
// panning and hovering reuse it. Like the shadow layer it is keyed on the edit revision; a caller that cannot say
// (no `layersRevision`) gets it rebuilt every frame rather than a stale one.

/** Light levels sampled per cell along each axis. */
const SAMPLES_PER_CELL = 4;

interface Illumination {
  extent: { minX: number; minY: number; maxX: number; maxY: number };
  grid: Float32Array;
  gridW: number;
  gridH: number;
}

interface IlluminationKey {
  layers: DungeonMapLayers;
  revision: number;
  dressing: DressingCatalog;
  runtimes: TilePackRuntime[];
  fallback: TilePackRuntime | null;
  currentPackId: string;
  darkness: DarknessLevel;
}

let illuminationCache: { key: IlluminationKey; value: Illumination | null } | null = null;

function sameIlluminationKey(a: IlluminationKey, b: IlluminationKey): boolean {
  return (
    a.layers === b.layers &&
    a.revision === b.revision &&
    a.dressing === b.dressing &&
    a.fallback === b.fallback &&
    a.currentPackId === b.currentPackId &&
    a.darkness === b.darkness &&
    a.runtimes.length === b.runtimes.length &&
    a.runtimes.every((r, i) => r === b.runtimes[i])
  );
}

function buildIllumination(
  scene: MapRenderScene,
  darkness: DarknessLevel,
  runtime: DrawMapInput["runtime"],
): Illumination | null {
  const extent = paintedExtent(scene.layers);
  if (!extent) return null;
  const sources = gatherLightSources(scene.layers, runtime, scene.dressing, null).map(({ x, y, light }) => ({
    x,
    y,
    bright: light.bright,
    dim: light.dim,
  }));
  const cols = extent.maxX - extent.minX + 1;
  const rows = extent.maxY - extent.minY + 1;
  const grid = illuminationGrid({
    ambient: AMBIENT[darkness],
    sources,
    // The map's own walls and solid rock, in map cells (origin 0): the preview shows what the battle map will.
    occluders: occluders(collectOcclusion(scene.layers, 0, 0)),
    minX: extent.minX,
    minY: extent.minY,
    cols,
    rows,
    samplesPerCell: SAMPLES_PER_CELL,
  });
  return { extent, grid, gridW: cols * SAMPLES_PER_CELL, gridH: rows * SAMPLES_PER_CELL };
}

function cachedIllumination(
  scene: MapRenderScene,
  darkness: DarknessLevel,
  runtime: DrawMapInput["runtime"],
): Illumination | null {
  if (scene.layersRevision === undefined) return buildIllumination(scene, darkness, runtime);
  const key: IlluminationKey = {
    layers: scene.layers,
    revision: scene.layersRevision,
    dressing: scene.dressing,
    runtimes: [...scene.runtimes.values()],
    fallback: scene.fallbackRuntime,
    currentPackId: scene.currentPackId,
    darkness,
  };
  if (illuminationCache && sameIlluminationKey(illuminationCache.key, key)) return illuminationCache.value;
  const value = buildIllumination(scene, darkness, runtime);
  illuminationCache = { key, value };
  return value;
}

/** The cell box around everything painted, or null for an empty map: the area the veil covers. */
export function paintedExtent(layers: DungeonMapLayers): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let extent: { minX: number; minY: number; maxX: number; maxY: number } | null = null;
  for (const cells of [layers.floor, layers.terrain, layers.solidBlock, layers.object]) {
    for (const key of Object.keys(cells) as CellKey[]) {
      const [xs, ys] = key.split(",");
      const x = Number(xs);
      const y = Number(ys);
      if (!extent) extent = { minX: x, minY: y, maxX: x, maxY: y };
      else {
        extent.minX = Math.min(extent.minX, x);
        extent.minY = Math.min(extent.minY, y);
        extent.maxX = Math.max(extent.maxX, x);
        extent.maxY = Math.max(extent.maxY, y);
      }
    }
  }
  return extent;
}

// ── Canvas rendering ───────────────────────────────────────────────────────

export function renderMap(scene: MapRenderScene): void {
  const {
    ctx,
    canvasWidth,
    canvasHeight,
    tilePx,
    viewportOffset,
    bounds,
    layers,
    metadata,
    glyphs,
    runtimes,
    fallbackRuntime,
    currentPackId,
    activeTool,
    viewMode,
    hoveredEdge,
    hoverCell,
    brushPreview,
    selectedCell,
    previewCells,
    referenceImage,
    gridAlpha,
    dressing,
    dressingGhost,
    selectedDressingId,
    editorMarks,
    darkness,
  } = scene;
  const { minX, minY, maxX, maxY } = bounds;

  ctx.imageSmoothingEnabled = false;
  const pass = scene.pass;
  if (pass === "standing" || pass === "aids") {
    // The ground canvas under these holds the background and the base image.
    ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  } else {
    ctx.fillStyle = "rgb(20, 18, 16)";
    ctx.fillRect(0, 0, canvasWidth, canvasHeight);
  }

  // Reference layer (#884 S6) — drawn right after the background fill so
  // every painted layer sits above it, ghost-faint underneath the drawing.
  if (referenceImage && (pass === undefined || pass === "ground")) {
    ctx.save();
    ctx.globalAlpha = referenceImage.opacity;
    ctx.drawImage(referenceImage.source, referenceImage.x, referenceImage.y, referenceImage.width, referenceImage.height);
    ctx.restore();
  }

  // Pack content (floor .. glyphs) is drawn by the shared module the offline
  // bake also uses. Every pack layer is skipped while no runtime has loaded,
  // and an unknown pack id falls back to the active pack's runtime here —
  // neither of which the bake does.
  const rt = (pid: string): TilePackRuntime | null =>
    runtimes.size > 0 ? (runtimes.get(pid) ?? fallbackRuntime ?? null) : null;

  const content: DrawMapInput = {
    ctx,
    tilePx,
    origin: viewportOffset,
    bounds,
    layers,
    runtime: rt,
    defaultPackId: currentPackId,
    glyphs,
    glyphPackId: currentPackId,
    dressing,
    lights: true,
    pass: pass === "aids" ? undefined : pass,
    omitLive: scene.omitLive,
    // The editor shows the walls that are hidden in the bake, dashed, so the DM can find and edit them.
    showHiddenWalls: true,
    makeCanvas: scene.makeCanvas ?? offscreenMakeCanvas(),
    afterGround: () => {
      if (gridAlpha === null) return;
      ctx.strokeStyle = `rgba(255, 255, 255, ${gridAlpha})`;
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = minX; x <= maxX + 1; x++) {
        const px = x * tilePx - viewportOffset.x;
        ctx.moveTo(px, 0);
        ctx.lineTo(px, canvasHeight);
      }
      for (let y = minY; y <= maxY + 1; y++) {
        const py = y * tilePx - viewportOffset.y;
        ctx.moveTo(0, py);
        ctx.lineTo(canvasWidth, py);
      }
      ctx.stroke();
    },
  };
  // Shadows come from the cache; a null layer (no OffscreenCanvas) draws none.
  // The standing pass draws neither (they lie on the ground), so it builds neither.
  const standingOnly = pass === "standing";
  if (pass !== "aids") {
    drawMapContent({
      ...content,
      shadows: true,
      shadowLayer: standingOnly ? null : cachedLayer("shadow", scene, content, renderShadowLayer),
      lightLayer: content.lights && !standingOnly ? cachedLayer("light", scene, content, (c) => renderLightLayer({ ...c, lightMasks: lightMasksFor(scene) })) : null,
    });
  }
  // While motion plays the map is three canvases: the ground, what stands, and (above the animated veil) the aids.
  if (pass === "ground" || pass === "standing") return;

  // The DM's darkness veil, carved by the map's lights, over the drawing but under the editing aids (labels, link
  // dots, selection), so what the DM is working on stays readable. The same function paints it on the battle map.
  // While motion plays the animated veil above the canvas draws it instead (`omitLive`), so its lit edge can breathe.
  if (darkness && darkness !== "daylight" && !scene.omitLive) {
    const lit = cachedIllumination(scene, darkness, rt);
    if (lit) {
      const { extent } = lit;
      paintLitVeil(
        ctx,
        {
          x: extent.minX * tilePx - viewportOffset.x,
          y: extent.minY * tilePx - viewportOffset.y,
          w: (extent.maxX - extent.minX + 1) * tilePx,
          h: (extent.maxY - extent.minY + 1) * tilePx,
        },
        lit.grid,
        lit.gridW,
        lit.gridH,
        content.makeCanvas,
      );
    }
  }

  // Annotation layer — text labels centered in each cell
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const ann = layers.annotation[cellKey(x, y)];
      if (!ann?.text) continue;
      const drawX = x * tilePx - viewportOffset.x;
      const drawY = y * tilePx - viewportOffset.y;
      const fontSize = Math.max(9, Math.round(tilePx * 0.16));
      ctx.font = `bold ${fontSize}px sans-serif`;
      ctx.fillStyle = "rgba(0,0,0,0.55)";
      ctx.fillText(ann.text, drawX + tilePx / 2 + 1, drawY + tilePx / 2 + 1, tilePx - 8);
      ctx.fillStyle = "rgba(255,240,180,0.95)";
      ctx.fillText(ann.text, drawX + tilePx / 2, drawY + tilePx / 2, tilePx - 8);
    }
  }

  // Entity link indicator — small blue dot in top-right corner when a cell has links
  const dotR = Math.max(4, tilePx * 0.07);
  for (let y = minY; y <= maxY; y++) {
    for (let x = minX; x <= maxX; x++) {
      const meta = metadata[cellKey(x, y)];
      if (!meta?.note_id && !meta?.encounter_id) continue;
      const drawX = x * tilePx - viewportOffset.x;
      const drawY = y * tilePx - viewportOffset.y;
      ctx.fillStyle = "rgba(80,180,255,0.9)";
      ctx.beginPath();
      ctx.arc(drawX + tilePx - dotR * 2, drawY + dotR * 2, dotR, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // Selected-cell highlight (link + annotate tools)
  if (selectedCell && (activeTool === "link" || activeTool === "annotate")) {
    const [sx, sy] = selectedCell;
    const drawX = sx * tilePx - viewportOffset.x;
    const drawY = sy * tilePx - viewportOffset.y;
    ctx.strokeStyle = "rgba(80,180,255,0.85)";
    ctx.lineWidth = 2;
    ctx.strokeRect(drawX + 1, drawY + 1, tilePx - 2, tilePx - 2);
  }

  // Dressing ghost and selection outline
  if (dressingGhost) {
    const { placement, alpha } = dressingGhost;
    drawDressing(
      ctx,
      placement,
      dressing.get(placement.prop_id),
      placement.x * tilePx - viewportOffset.x,
      placement.y * tilePx - viewportOffset.y,
      tilePx,
      alpha,
    );
  }
  const selectedDressing = selectedDressingId ? layers.dressing[selectedDressingId] : undefined;
  if (selectedDressing) {
    const { w, h } = dressingFootprint(selectedDressing, dressing);
    strokeDressingOutline(
      ctx,
      selectedDressing,
      w,
      h,
      selectedDressing.x * tilePx - viewportOffset.x,
      selectedDressing.y * tilePx - viewportOffset.y,
      tilePx,
      "rgba(80,180,255,0.9)",
    );
  }

  if (editorMarks && !viewMode) paintEditorMarks(ctx, layers, editorMarks, tilePx, viewportOffset);

  // Origin marker
  const ox = 0 - viewportOffset.x;
  const oy = 0 - viewportOffset.y;
  ctx.strokeStyle = "rgba(200, 160, 60, 0.5)";
  ctx.lineWidth = 2;
  ctx.strokeRect(ox, oy, tilePx, tilePx);

  // Rect / line drag preview
  if (previewCells.size > 0) {
    ctx.fillStyle = "rgba(140, 220, 140, 0.25)";
    for (const key of previewCells) {
      const [xs, ys] = (key as string).split(",");
      const px = Number(xs) * tilePx - viewportOffset.x;
      const py = Number(ys) * tilePx - viewportOffset.y;
      ctx.fillRect(px, py, tilePx, tilePx);
    }
  }

  if (!viewMode) {
    // Cell-hover highlight (only when the active tool targets cells)
    if (hoverCell && (activeTool === "floor" || activeTool === "template" || (activeTool === "eraser" && !hoveredEdge))) {
      const [hx, hy] = hoverCell;
      const drawX = hx * tilePx - viewportOffset.x;
      const drawY = hy * tilePx - viewportOffset.y;
      ctx.strokeStyle = activeTool === "eraser" ? "rgba(220, 80, 80, 0.6)" : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX, drawY, tilePx, tilePx);
    }

    if (brushPreview && activeTool === "brush") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(brushPreview.x * tilePx - viewportOffset.x, brushPreview.y * tilePx - viewportOffset.y, brushPreview.radius * tilePx, 0, Math.PI * 2);
      ctx.setLineDash(brushPreview.erase ? [6, 4] : []);
      ctx.lineWidth = 2;
      ctx.strokeStyle = brushPreview.erase ? "rgba(220, 80, 80, 0.85)" : "rgba(255, 255, 255, 0.7)";
      ctx.stroke();
      ctx.restore();
    }

    // Edge-hover highlight (wall / door / edge-aware eraser tools)
    if (hoveredEdge) {
      const { x, y, side } = hoveredEdge;
      const baseX = x * tilePx - viewportOffset.x;
      const baseY = y * tilePx - viewportOffset.y;
      const isErase = activeTool === "eraser";
      ctx.strokeStyle = isErase ? "rgba(220, 80, 80, 0.85)" : "rgba(255, 220, 100, 0.85)";
      ctx.lineWidth = Math.max(3, tilePx * 0.08);
      ctx.lineCap = "round";
      ctx.beginPath();
      switch (side) {
        case "N": ctx.moveTo(baseX, baseY);             ctx.lineTo(baseX + tilePx, baseY); break;
        case "S": ctx.moveTo(baseX, baseY + tilePx);    ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
        case "W": ctx.moveTo(baseX, baseY);             ctx.lineTo(baseX, baseY + tilePx); break;
        case "E": ctx.moveTo(baseX + tilePx, baseY);    ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
      }
      ctx.stroke();
    }
  }
}
