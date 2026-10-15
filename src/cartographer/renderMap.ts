// Canvas rendering for the cartographer map editor.
//
// Pulled out of CartographerEditorView.vue's `render()` so the drawing logic
// can be exercised without a live <canvas> or Vue reactivity. `renderMap`
// receives plain values only — never Vue refs — so it must not import from
// "vue". The view stays responsible for reading its refs each frame and
// building the `MapRenderScene`.

import type { PackCategory } from "@/cartographer/packSchema";
import {
  drawMapContent,
  offscreenMakeCanvas,
  renderShadowLayer,
  type DrawMapInput,
  type MakeCanvas,
  type ShadowLayer,
} from "@/cartographer/drawMap";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { cellKey, type CellKey, type DungeonMapLayers, type CellMetadata, type DressingPlacement } from "@/types/dungeonMap.types";
import type { CellEdge } from "@/cartographer/edges";
import { boundaryEdges } from "@/cartographer/floodFill";
import type { Tool } from "@/cartographer/tools";
import {
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
  // Interaction state render() reads — same types the view already declares
  // for these refs.
  activeTool: Tool;
  viewMode: boolean;
  hoveredEdge: CellEdge | null;
  hoverCell: [number, number] | null;
  selectedCell: [number, number] | null;
  previewCells: Set<CellKey>;
  /**
   * Derived spaces to outline with their proposed name (#868) — the Space
   * tool's "here's what claiming a region gets you" preview. Only ever set
   * while that tool is active; every other tool leaves this undefined and
   * draws no outlines, same convention as `hoveredEdge`/`previewCells`.
   */
  derivedSpaces?: { key: string; cells: CellKey[]; displayName: string; nameSource: "annotation" | null }[];
  selectedSpaceKey?: string | null;
  /**
   * A site's Picture layer, shown as a ghost reference beneath everything
   * else (epic #884 S6 — MapWorkbench embedded in the Atlas). Positioning is
   * computed by the caller from the site's `grid_calibration` against this
   * frame's own `tilePx`/`viewportOffset` — this function only draws it, the
   * same "plain values in" rule as every other field here. Absent for the
   * standalone `/cartographer/:id` route, which passes no site.
   */
  referenceImage?: MapRenderReferenceImage | null;
  /** Dressing props by id (epic #1062), with whatever art has loaded so far. */
  dressing: DressingCatalog;
  /** A prop being placed or dragged, drawn translucent above the map. */
  dressingGhost?: { placement: DressingPlacement; alpha: number } | null;
  /** The selected placement, outlined. */
  selectedDressingId?: string | null;
  /**
   * Bumps on every edit of `layers` (the editor's `editRevision`). The editor
   * paints INTO the same `layers` object, so its identity cannot tell the
   * shadow cache that the map changed; this can. Absent means the caller cannot
   * say, and the shadows are then rebuilt every frame rather than risk showing
   * a stale one.
   */
  layersRevision?: number;
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
  tilePx: number;
  bounds: MapRenderScene["bounds"];
  offsetX: number;
  offsetY: number;
}

let shadowCache: { key: ShadowKey; layer: ShadowLayer | null } | null = null;

function sameShadowKey(a: ShadowKey, b: ShadowKey): boolean {
  return (
    a.layers === b.layers &&
    a.revision === b.revision &&
    a.dressing === b.dressing &&
    a.fallback === b.fallback &&
    a.currentPackId === b.currentPackId &&
    a.tilePx === b.tilePx &&
    a.offsetX === b.offsetX &&
    a.offsetY === b.offsetY &&
    a.bounds.minX === b.bounds.minX &&
    a.bounds.minY === b.bounds.minY &&
    a.bounds.maxX === b.bounds.maxX &&
    a.bounds.maxY === b.bounds.maxY &&
    a.runtimes.length === b.runtimes.length &&
    a.runtimes.every((r, i) => r === b.runtimes[i])
  );
}

function cachedShadowLayer(scene: MapRenderScene, input: DrawMapInput): ShadowLayer | null {
  if (!input.makeCanvas) return null;
  if (scene.layersRevision === undefined) return renderShadowLayer(input);
  const key: ShadowKey = {
    layers: scene.layers,
    revision: scene.layersRevision,
    dressing: scene.dressing,
    runtimes: [...scene.runtimes.values()],
    fallback: scene.fallbackRuntime,
    currentPackId: scene.currentPackId,
    tilePx: scene.tilePx,
    bounds: scene.bounds,
    offsetX: scene.viewportOffset.x,
    offsetY: scene.viewportOffset.y,
  };
  if (shadowCache && sameShadowKey(shadowCache.key, key)) return shadowCache.layer;
  const layer = renderShadowLayer(input);
  shadowCache = { key, layer };
  return layer;
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
    selectedCell,
    previewCells,
    derivedSpaces,
    selectedSpaceKey,
    referenceImage,
    dressing,
    dressingGhost,
    selectedDressingId,
  } = scene;
  const { minX, minY, maxX, maxY } = bounds;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgb(20, 18, 16)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  // Reference layer (#884 S6) — drawn right after the background fill so
  // every painted layer sits above it, ghost-faint underneath the drawing.
  if (referenceImage) {
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
    makeCanvas: scene.makeCanvas ?? offscreenMakeCanvas(),
    afterGround: () => {
      // Grid overlay
      ctx.strokeStyle = "rgba(255, 255, 255, 0.06)";
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
    afterDressing: () => {
      // Derived-space outlines (#868) — the Space tool's "here's the region
      // you'd claim" preview. Traces the space's true perimeter (not per-cell
      // boxes) via `boundaryEdges`, same helper Wrap Walls uses to find the
      // edges facing void.
      if (derivedSpaces && derivedSpaces.length > 0) {
        for (const space of derivedSpaces) {
          const isSelected = space.key === selectedSpaceKey;
          ctx.strokeStyle = isSelected ? "rgba(96,165,250,0.9)" : "rgba(255,255,255,0.35)";
          ctx.lineWidth = isSelected ? 2.5 : 1.5;
          ctx.setLineDash([tilePx * 0.15, tilePx * 0.1]);
          ctx.beginPath();
          for (const { x, y, side } of boundaryEdges(new Set(space.cells))) {
            const baseX = x * tilePx - viewportOffset.x;
            const baseY = y * tilePx - viewportOffset.y;
            switch (side) {
              case "N": ctx.moveTo(baseX, baseY);           ctx.lineTo(baseX + tilePx, baseY); break;
              case "S": ctx.moveTo(baseX, baseY + tilePx);   ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
              case "W": ctx.moveTo(baseX, baseY);            ctx.lineTo(baseX, baseY + tilePx); break;
              case "E": ctx.moveTo(baseX + tilePx, baseY);   ctx.lineTo(baseX + tilePx, baseY + tilePx); break;
            }
          }
          ctx.stroke();
          ctx.setLineDash([]);

          // An annotation-sourced name is already drawn by the annotation layer
          // below, at the cell it was typed into — drawing it again at the
          // space's centroid would show the same name twice on screen. Only a
          // space with no annotation of its own (still "Region N") needs this
          // layer to say its name at all.
          if (space.nameSource !== "annotation") {
            const cx = space.cells.reduce((sum, c) => sum + Number(c.split(",")[0]), 0) / space.cells.length;
            const cy = space.cells.reduce((sum, c) => sum + Number(c.split(",")[1]), 0) / space.cells.length;
            const labelX = (cx + 0.5) * tilePx - viewportOffset.x;
            const labelY = (cy + 0.5) * tilePx - viewportOffset.y;
            const fontSize = Math.max(10, Math.round(tilePx * 0.18));
            ctx.font = `bold ${fontSize}px sans-serif`;
            ctx.textAlign = "center";
            ctx.textBaseline = "middle";
            ctx.fillStyle = "rgba(0,0,0,0.6)";
            ctx.fillText(space.displayName, labelX + 1, labelY + 1);
            ctx.fillStyle = isSelected ? "rgba(191,219,254,0.95)" : "rgba(255,255,255,0.75)";
            ctx.fillText(space.displayName, labelX, labelY);
          }
        }
      }
    },
  };
  // Shadows come from the cache; a null layer (no OffscreenCanvas) draws none.
  drawMapContent({ ...content, shadows: true, shadowLayer: cachedShadowLayer(scene, content) });

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
    if (hoverCell && (activeTool === "floor" || activeTool === "cave" || activeTool === "template" || (activeTool === "eraser" && !hoveredEdge))) {
      const [hx, hy] = hoverCell;
      const drawX = hx * tilePx - viewportOffset.x;
      const drawY = hy * tilePx - viewportOffset.y;
      ctx.strokeStyle = activeTool === "eraser" ? "rgba(220, 80, 80, 0.6)" : "rgba(255, 255, 255, 0.35)";
      ctx.lineWidth = 2;
      ctx.strokeRect(drawX, drawY, tilePx, tilePx);
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
