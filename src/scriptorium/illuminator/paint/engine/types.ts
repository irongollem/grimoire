/*
 * The paint engine's shared shapes (#1181). A brush is a tip stamped along the
 * pen's path, shaped by dynamics, catching a grain, with flow building up
 * inside a stroke under an opacity cap. Strokes paint straight into a tiled
 * layer; nothing keeps a stroke as a list.
 *
 * Every number is a plain fraction or a pixel count so a brush is JSON: stock
 * brushes, a user's own and imported ones all share this one shape.
 */

/**
 * What drives a dynamic. Only a pen reports pressure: a mouse, trackpad or finger paints at full pressure (never
 * fading by itself, the maintainer found that a stroke thinning on a trackpad reads as a bug). "fade" is only
 * ever chosen on purpose.
 */
export type DynamicControl = "off" | "pressure" | "tilt" | "rotation" | "direction" | "fade";

/**
 * A value that varies per dab: random jitter (0 to 1) on top of a control. `minimum` (0 to 1) is the floor the
 * control can bring it down to, so it means nothing when `control` is "off".
 */
export interface Varied {
  jitter: number;
  control: DynamicControl;
  minimum: number;
}

/** A round tip computed from its hardness (0 soft to 1 hard), or an image tip from the asset store. */
export type TipSource = { kind: "round"; hardness: number } | { kind: "image"; id: string };

export interface TipSettings {
  source: TipSource;
  /** Diameter in canvas pixels at full pressure. */
  size: number;
  /** Degrees, clockwise. With `followDirection` it is added to the stroke's heading. */
  angle: number;
  /** 1 is as drawn; less squashes the tip across its angle. */
  roundness: number;
  /** Distance between dabs as a fraction of the dab's current size. */
  spacing: number;
  flipX: boolean;
  flipY: boolean;
  /** Turn the tip with the stroke's heading (a flat brush keeps its edge across the stroke). */
  followDirection: boolean;
}

export interface ShapeDynamics {
  size: Varied;
  /** `minimum` is unused for angle; jitter 1 is a full turn. */
  angle: Varied;
  roundness: Varied;
}

export interface Scatter {
  /** How far a dab may land off the path, as a fraction of its size. */
  amount: number;
  /** Off the path in both directions, not only across it. */
  bothAxes: boolean;
  /** Dabs per spacing step (1 or more). */
  count: number;
  countJitter: number;
}

export interface Grain {
  /**
   * The grain this brush brings. With mode "paper" on a picture painted on a paper, the paper's own grain is
   * used instead, so every brush catches the tooth of the sheet it is on; `id` is the fallback.
   */
  id: string;
  /** Grain pixels per canvas pixel (1 = the texture at its own size). */
  scale: number;
  /** How much paint the grain's hollows take away (0 to 1). */
  depth: number;
  /** "paper" stays put in the canvas; "moving" travels with each dab. */
  mode: "paper" | "moving";
}

export interface Transfer {
  /** Paint per dab (0 to 1). Dabs build up within a stroke. The options bar's Flow replaces it. */
  flow: number;
  /** The most a single stroke can lay down (0 to 1), however many dabs overlap. The options bar's Opacity replaces it. */
  opacity: number;
  /** How flow varies per dab, as a multiplier of `flow`. */
  flowDynamics: Varied;
  /** How the opacity cap varies per dab, as a multiplier of `opacity`. */
  opacityDynamics: Varied;
}

/** Picks up the paint underneath and drags it. Smudge always mixes; a brush mixes only when this is set. */
export interface WetMix {
  /** How much water thins what the brush lays down (0 to 1). */
  dilution: number;
  /** How much of its own colour the brush carries at the start of a stroke (0 to 1). */
  charge: number;
  /** How strongly the paint underneath is picked up and carried (0 to 1). */
  pull: number;
}

export interface ColourDynamics {
  /** Jitter ranges, 0 to 1 each. */
  hue: number;
  saturation: number;
  value: number;
}

/** How a stroke mixes with what is already on its layer. "behind" paints only where the layer is empty; "clear" removes. */
export type BrushBlend = "normal" | "multiply" | "screen" | "overlay" | "soft-light" | "colour" | "behind" | "clear";

export type BrushGroup = "basic" | "watercolour" | "bristle" | "dry" | "ink" | "texture" | "yours";

export interface BrushPreset {
  v: 1;
  id: string;
  name: string;
  group: BrushGroup;
  tip: TipSettings;
  /** Null: every dab is the tip as set, with no jitter and no control. */
  shape: ShapeDynamics | null;
  scatter: Scatter | null;
  grain: Grain | null;
  transfer: Transfer;
  /** Paint pools at the edge of the finished stroke (applied to the stroke, never baked into the tip). */
  wetEdges: boolean;
  wetMix: WetMix | null;
  colour: ColourDynamics | null;
  /** 0 follows the pen exactly; 1 steadies the line heavily. */
  smoothing: number;
  blend: BrushBlend;
  /** Pixels over which "fade" runs from full to its minimum. */
  fadeLength: number;
}

/** One pointer sample, in canvas pixels. Tilt in degrees (-90 to 90), twist in degrees (0 to 359). */
export interface PenSample {
  x: number;
  y: number;
  pressure: number;
  tiltX: number;
  tiltY: number;
  twist: number;
  time: number;
  pointer: "pen" | "mouse" | "touch";
}

/** The pressure curve: a cubic from (0,0) to (1,1) through two control points. Kept per device, not per brush. */
export interface PressureCurve {
  c1: { x: number; y: number };
  c2: { x: number; y: number };
}

export interface Rgb {
  r: number;
  g: number;
  b: number;
}

/** A tip's coverage, 0 to 255 per pixel, row by row. */
export interface TipImage {
  width: number;
  height: number;
  alpha: Uint8Array;
}

/** A grain's height, 0 (hollow) to 255 (peak), row by row. Tiles seamlessly. */
export interface GrainImage {
  width: number;
  height: number;
  value: Uint8Array;
}

/** Where the engine finds image tips and grains by id. */
export interface PaintAssets {
  tip(id: string): TipImage | undefined;
  grain(id: string): GrainImage | undefined;
}

export type { Paper } from "@/scriptorium/papers/papers";

/** What the pointer does: lays paint, takes it away, or drags what is there. */
export type StrokeMode = "paint" | "erase" | "smudge";
