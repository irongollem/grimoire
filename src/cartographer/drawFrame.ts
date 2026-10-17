// The shapes the map renderer shares between its modules (drawMap.ts, drawLights.ts): its input, the canvas
// factory, a prebuilt layer, and the frame/target the painters take. Types and one constructor only, so a painter
// module can import them without importing the renderer that calls it.

import type { PackCategory } from "@/cartographer/packSchema";
import type { TilePackRuntime } from "@/cartographer/packLoader";
import type { CellKey, DungeonMapLayers } from "@/types/dungeonMap.types";
import type { LightMaskCache } from "@/cartographer/lightMask";
import type { Ctx2D, DressingCatalog } from "@/cartographer/dressing";

export interface ShadowLayer {
  canvas: CanvasImageSource;
  /** Screen position of the layer's top-left pixel. */
  left: number;
  top: number;
  width: number;
  height: number;
}

export type MakeCanvas = (width: number, height: number) => { canvas: CanvasImageSource; ctx: Ctx2D } | null;

export interface DrawMapInput {
  ctx: Ctx2D;
  tilePx: number;
  /** Screen position of cell (0,0)'s top-left is (-origin.x, -origin.y): screenX = cellX * tilePx - origin.x. */
  origin: { x: number; y: number };
  /** Inclusive cell window to draw (the live viewport, or the bake's painted extent). */
  bounds: { minX: number; minY: number; maxX: number; maxY: number };
  layers: DungeonMapLayers;
  /**
   * Which runtime draws a given pack. The live editor falls back to the active
   * pack's runtime for an unknown id; the bake deliberately does not, because
   * a bake must not draw a map in a pack it was not painted with.
   */
  runtime: (packId: string) => TilePackRuntime | null;
  /** The pack joints fall back to when no adjacent edge names one (live: currentPackId; bake: null). */
  defaultPackId: string | null;
  glyphs: Record<CellKey, PackCategory>;
  /** Pack the glyphs draw against; they carry no stored pack id of their own. */
  glyphPackId: string | null;
  dressing: DressingCatalog;
  /** Called after the ground (floor, terrain, sunk edges), before everything that stands (the live grid). */
  afterGround?: () => void;
  /** Called after dressing and the walls, before glyphs (the live derived-space outlines). */
  afterDressing?: () => void;
  /** Draw the glow of things that give light (a lantern, a fire). Needs no canvas, only the 2D context. */
  lights: boolean;
  /** Draw render-time shadows. Needs `makeCanvas` (or a prebuilt `shadowLayer`); without one the map draws without. */
  shadows?: boolean;
  /** A canvas factory for the shadow layers; absent where there is no offscreen canvas (node tests, old browsers). */
  makeCanvas?: MakeCanvas;
  /**
   * A shadow layer built earlier by `renderShadowLayer`, so the live editor can
   * reuse it across frames. `null` means "none could be made": draw without.
   */
  shadowLayer?: ShadowLayer | null;
  /**
   * The glow of the lights, masked to what each can see, built earlier by `renderLightLayer` so the live editor can
   * reuse it across frames. Absent: built here. `null` means "none could be made" (no canvas): the glow is drawn
   * straight onto the map, unmasked, so it crosses walls.
   */
  lightLayer?: ShadowLayer | null;
  /**
   * Light visibility masks kept between builds of the light layer. They are in cell units and depend only on the map's
   * walls and the light, not on pan or zoom, so the editor holds one per edit revision (`newLightMaskCache`) and a pan
   * only re-composites gradients. Absent (the bake): a fresh one, which simply misses.
   */
  lightMasks?: LightMaskCache;
  /**
   * Which part of the map to draw. The battle map lays its grid between the
   * floor and what stands on it, so a bake is made twice: `ground` is what the
   * grid draws over, `standing` what draws over the grid. Absent is `all`, the
   * whole map in one go (the live editor, the PNG download, the AI input).
   */
  pass?: MapPass;
  /**
   * Leave out the standing objects and Dressing that sway in the live battle map (`objectSway`, `dressingSway`), so
   * the live layer can draw them moving without a still copy under it. The shadow layer keeps them: their shadow
   * stays on the floor. Default false.
   */
  omitSway?: boolean;
}

export type MapPass = "all" | "ground" | "standing";

export interface Frame {
  tilePx: number;
  bounds: DrawMapInput["bounds"];
  layers: DungeonMapLayers;
  runtime: DrawMapInput["runtime"];
  defaultPackId: string | null;
  glyphs: Record<CellKey, PackCategory>;
  glyphPackId: string | null;
  dressing: DressingCatalog;
  makeCanvas: MakeCanvas | undefined;
  /** Leave out what the live layer draws swaying (#1073); see `omitSway` on the input. */
  omitSway: boolean;
}

export interface Target {
  ctx: Ctx2D;
  /** screenX = cellX * tilePx - ox. */
  ox: number;
  oy: number;
}

export const frameOf = (input: DrawMapInput, bounds: DrawMapInput["bounds"]): Frame => ({
  tilePx: input.tilePx,
  bounds,
  layers: input.layers,
  runtime: input.runtime,
  defaultPackId: input.defaultPackId,
  glyphs: input.glyphs,
  glyphPackId: input.glyphPackId,
  dressing: input.dressing,
  makeCanvas: input.makeCanvas,
  omitSway: input.omitSway ?? false,
});
