// Canvas rendering for the cartographer map editor.
//
// Pulled out of CartographerEditorView.vue's `render()` so the drawing logic
// can be exercised without a live <canvas> or Vue reactivity. `renderMap`
// receives plain values only — never Vue refs — so it must not import from
// "vue". The view stays responsible for reading its refs each frame and
// building the `MapRenderScene`.

import type { PackCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import { cellKey, type CellKey, type DungeonMapLayers, type CellMetadata } from "@/types/dungeonMap.types";
import { classifyJoint, type CellEdge } from "@/cartographer/edges";
import { boundaryEdges } from "@/cartographer/floodFill";
import type { Tool } from "@/cartographer/tools";
import type { ZoneKind } from "@/types/locationMapRegion.types";

// Fill / accent colour per zone kind (#868). `src/lib/locations/zones.ts` is
// the Atlas-side twin that colours a published region the same way — the two
// must be kept in sync by hand; there is no shared source because this file
// must not import from `lib/locations/` (module-placement boundary) and that
// file has no reason to import a Cartographer-only render module.
export const ZONE_RENDER_COLOURS: Record<ZoneKind, { fill: string; accent: string }> = {
  terrain: { fill: "rgba(56,189,248,.30)", accent: "rgba(56,189,248,.85)" },
  hazard: { fill: "rgba(251,146,60,.32)", accent: "rgba(251,146,60,.9)" },
  light: { fill: "rgba(139,92,246,.30)", accent: "rgba(167,139,250,.9)" },
  trigger: { fill: "rgba(244,63,94,.30)", accent: "rgba(244,63,94,.9)" },
  marker: { fill: "rgba(120,113,108,.30)", accent: "rgba(168,162,158,.85)" },
};

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
}

// ── Geometry helpers ───────────────────────────────────────────────────────

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
  } = scene;
  const { minX, minY, maxX, maxY } = bounds;

  ctx.imageSmoothingEnabled = false;
  ctx.fillStyle = "rgb(20, 18, 16)";
  ctx.fillRect(0, 0, canvasWidth, canvasHeight);

  const rt = (pid: string): TilePackRuntime | null =>
    runtimes.get(pid) ?? fallbackRuntime ?? null;

  // Floor layer
  if (runtimes.size > 0) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const k = cellKey(x, y);
        const cell = layers.floor[k];
        if (!cell?.floor) continue;
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        const r = rt(cell.floor.pack_id);
        if (!r) continue;
        const tile = r.getTile("floor", cell.floor.variant);
        ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
      }
    }
  }

  // SolidBlock layer — full-cell thick walls rendered above the floor
  if (runtimes.size > 0) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const solid = layers.solidBlock[cellKey(x, y)];
        if (!solid) continue;
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        const r = rt(solid.pack_id);
        if (!r) continue;
        const tile = r.getTile("solidBlock", solid.variant);
        ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
      }
    }
  }

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

  // Edge walls — drawn AFTER the grid so walls visually mask the gridline
  // they sit on. The wall tile is 128×128 with the painted strip in the
  // CENTER (vertically for H, horizontally for V). We shift the tile by
  // half a tile so the strip lands ON the gridline, straddling both
  // adjacent cells equally. NW ownership: cell stores wallN/wallW.
  if (runtimes.size > 0) {
    const halfTile = tilePx / 2;
    for (let y = minY; y <= maxY + 1; y++) {
      for (let x = minX; x <= maxX + 1; x++) {
        const cell = layers.floor[cellKey(x, y)];
        if (!cell) continue;
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        if (cell.wallN) {
          const seg = cell.wallN;
          const r = rt(seg.pack_id);
          if (r) {
            const cat: PackCategory = seg.type === "doorClosed" ? "doorClosedH"
              : seg.type === "doorOpen" ? "doorOpenH" : "wallSegmentH";
            const tile = r.getTile(cat, seg.variant);
            ctx.drawImage(tile.source, drawX, drawY - halfTile, tilePx, tilePx);
          }
        }
        if (cell.wallW) {
          const seg = cell.wallW;
          const r = rt(seg.pack_id);
          if (r) {
            const cat: PackCategory = seg.type === "doorClosed" ? "doorClosedV"
              : seg.type === "doorOpen" ? "doorOpenV" : "wallSegmentV";
            const tile = r.getTile(cat, seg.variant);
            ctx.drawImage(tile.source, drawX - halfTile, drawY, tilePx, tilePx);
          }
        }
      }
    }

    // Corner joints — fill / tile the gap at every grid intersection where H and
    // V wall strips meet. Uses the pack's optional wallJoint directional art when
    // available; falls back to a programmatic filled square otherwise.
    // Match tile strip width: actual extracted assets use ~35/128 of tile height.
    const thickness = tilePx * (35 / 128);
    const halfThick = thickness / 2;
    for (let jy = minY; jy <= maxY + 1; jy++) {
      for (let jx = minX; jx <= maxX + 1; jx++) {
        const wH = !!layers.floor[cellKey(jx - 1, jy)]?.wallN;
        const eH = !!layers.floor[cellKey(jx, jy)]?.wallN;
        const nV = !!layers.floor[cellKey(jx, jy - 1)]?.wallW;
        const sV = !!layers.floor[cellKey(jx, jy)]?.wallW;
        if (!(wH || eH) || !(nV || sV)) continue;
        const cornerX = jx * tilePx - viewportOffset.x;
        const cornerY = jy * tilePx - viewportOffset.y;
        const side = classifyJoint(wH, eH, nV, sV);
        // Check all four adjacent walls for pack ownership — avoids falling back to
        // currentPackId and having corners change style when the active pack switches.
        const jointPackId =
          layers.floor[cellKey(jx, jy)]?.wallN?.pack_id ??
          layers.floor[cellKey(jx - 1, jy)]?.wallN?.pack_id ??
          layers.floor[cellKey(jx, jy)]?.wallW?.pack_id ??
          layers.floor[cellKey(jx, jy - 1)]?.wallW?.pack_id ??
          currentPackId;
        const jointRt = rt(jointPackId);

        // M6 schema v2: wallRoundJoint — drawn at full tile size centered on the corner.
        // Only honoured when the pack ships REAL art for it — procedural placeholders
        // fall through to the standard wallJoint handling so rectangular rooms don't
        // unexpectedly grow rounded corners before real round-corner art exists.
        if (side?.startsWith("L_") && jointRt && jointRt.variantCount("wallRoundJoint", side) > 0) {
          const roundTile = jointRt.getTile("wallRoundJoint", 0, side);
          if (!roundTile.isPlaceholder) {
            ctx.drawImage(roundTile.source, cornerX - tilePx / 2, cornerY - tilePx / 2, tilePx, tilePx);
            continue;
          }
        }

        // Prefer directional tile, fall back to generic (no side), then procedural square.
        const directional = side && jointRt && jointRt.variantCount("wallJoint", side) > 0
          ? jointRt.getTile("wallJoint", 0, side) : null;
        const generic = !directional?.source && jointRt
          ? jointRt.getTile("wallJoint", 0) : null;
        const jointTile = directional ?? generic;
        if (jointTile && !jointTile.isPlaceholder) {
          ctx.drawImage(jointTile.source, cornerX - halfThick, cornerY - halfThick, thickness, thickness);
        } else {
          // Fallback square: use pack palette colour (wallJoint → wallSegmentH → stone default).
          const pal = jointRt?.manifest.palette;
          const [r, g, b] = pal?.wallJoint ?? pal?.wallSegmentH ?? [40, 36, 32];
          ctx.fillStyle = `rgb(${r},${g},${b})`;
          ctx.fillRect(cornerX - halfThick, cornerY - halfThick, thickness, thickness);
        }
      }
    }
  }

  // Object layer — stamps drawn above walls
  if (runtimes.size > 0) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const obj = layers.object[cellKey(x, y)];
        if (!obj) continue;
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        const objRt = rt(obj.pack_id);
        if (!objRt) continue;
        const tile = objRt.getTile(obj.category as PackCategory, obj.variant);
        const rotation = (obj as { rotation?: number }).rotation ?? 0;
        if (rotation) {
          ctx.save();
          ctx.translate(drawX + tilePx / 2, drawY + tilePx / 2);
          ctx.rotate((rotation * Math.PI) / 180);
          ctx.drawImage(tile.source, -tilePx / 2, -tilePx / 2, tilePx, tilePx);
          ctx.restore();
        } else {
          ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
        }
      }
    }
  }

  // Zone layer (#868) — translucent fill + dashed cell border per kind,
  // drawn above objects so a stamped brazier still reads inside a "Light"
  // zone rather than being washed out by it.
  if (layers.zone) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const zone = layers.zone[cellKey(x, y)];
        if (!zone) continue;
        const colours = ZONE_RENDER_COLOURS[zone.kind];
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        ctx.fillStyle = colours.fill;
        ctx.fillRect(drawX, drawY, tilePx, tilePx);
        ctx.strokeStyle = colours.accent;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([tilePx * 0.12, tilePx * 0.08]);
        ctx.strokeRect(drawX + 1, drawY + 1, tilePx - 2, tilePx - 2);
        ctx.setLineDash([]);
      }
    }
  }

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

  // Hazard / feature glyph layer (#804) — a placed trap's or feature's
  // visual glyph, drawn above objects. There is no per-cell stored pack_id
  // for these (they aren't authored through a stamp tool; `glyphs` is
  // resolved live off the linked trap/feature — see cartographer/glyphs.ts),
  // so they draw against the currently active pack, same fallback rule as
  // the corner-joint code above. Variant is always 0 — this is a drawing
  // hint, not an authored stamp with variety to pick between.
  if (runtimes.size > 0) {
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const category = glyphs[cellKey(x, y)];
        if (!category) continue;
        const r = rt(currentPackId);
        if (!r) continue;
        const drawX = x * tilePx - viewportOffset.x;
        const drawY = y * tilePx - viewportOffset.y;
        const tile = r.getTile(category, 0);
        ctx.drawImage(tile.source, drawX, drawY, tilePx, tilePx);
      }
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
