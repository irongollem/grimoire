/*
 * A painting session's shapes (#1181 wave 2): the picture being painted, its layers, the armed tool and
 * brush, and one history across all of it. The engine (`../engine`) paints pixels; the session decides which
 * layer, with what, and keeps undo in the order things happened, whatever layer they touched.
 *
 * Pure data and logic: no Vue, no DOM, so it is tested in Node. The stage and the panels read and drive it
 * through `usePaintSession`, which wraps it in Vue reactivity.
 */
import type { TiledLayer } from "../engine/tiledLayer";
import type { UndoRecord } from "../engine/stroke";
import type { BrushPreset, PenSample, PressureCurve, Rgb } from "../engine/types";
import type { Paper } from "@/scriptorium/papers/papers";
import type { PaintLayerBlend } from "../../lib/treatment";

/** How a layer mixes with the layers under it: the same values the recipe's paint step stores. */
export type LayerBlend = PaintLayerBlend;

/**
 * The picture being illuminated is the bottom layer. It is never painted on: the Eraser on it paints its
 * mask (white = erased to the paper), which is what the recipe's mask step stores.
 */
export interface PictureLayer {
  kind: "picture";
  id: "picture";
  name: string;
  visible: boolean;
  /** Coverage in the alpha channel; RGB unused. */
  mask: TiledLayer;
}

export interface PaintLayer {
  kind: "paint";
  id: string;
  name: string;
  blend: LayerBlend;
  /** 0 to 1. */
  opacity: number;
  visible: boolean;
  /** Paint only where the layer already has paint: a stroke changes colour, never coverage. */
  lockAlpha: boolean;
  pixels: TiledLayer;
}

export type Layer = PictureLayer | PaintLayer;

/** The armed tool. The picker reads a colour; the others paint with the brush their tool remembers. */
export type PaintTool = "brush" | "smudge" | "eraser" | "picker";

/** The options bar's values; each replaces the brush's own while set. */
export interface ToolOverrides {
  size?: number;
  opacity?: number;
  flow?: number;
}

/** Undo entries, newest last. A stroke keeps only the tiles it changed; layer edits keep the layer list around them. */
export type HistoryEntry =
  | { kind: "stroke"; layerId: string; record: UndoRecord }
  | { kind: "layers"; before: LayerListSnapshot; after: LayerListSnapshot };

/** Everything about the layer list except pixels: order, names, blend, opacity, visibility, locks. */
export interface LayerListSnapshot {
  order: string[];
  props: Record<string, { name: string; blend?: LayerBlend; opacity?: number; visible: boolean; lockAlpha?: boolean }>;
}

export interface PaintDocument {
  /** Canvas pixels; the picture is drawn to fill them. */
  width: number;
  height: number;
  /** The sheet under everything, or null for a picture with no paper (transparent where erased). */
  paper: Paper | null;
  /** Bottom first. Always starts with the picture layer, except a blank sheet, which has none. */
  layers: Layer[];
}

/** What the stage hands the session for a stroke, in document pixels. */
export interface StrokeInput {
  samples: PenSample[];
}

export interface SessionState {
  doc: PaintDocument;
  activeLayerId: string;
  tool: PaintTool;
  /** Each painting tool remembers its own brush, as in the apps painters know. */
  brushes: Record<Exclude<PaintTool, "picker">, BrushPreset>;
  overrides: Record<Exclude<PaintTool, "picker">, ToolOverrides>;
  colour: Rgb;
  /** Recently used colours, newest first, at most 12. */
  recent: Rgb[];
  /** The device's pressure curve (kept per device by the caller, not per brush). */
  curve: PressureCurve;
}

/**
 * What a stroke does depends on the tool and the active layer:
 *  - Brush or Smudge on a paint layer paints or smudges it. On the picture layer (which is never painted on) a
 *    new paint layer is made just above it, made active, and the stroke goes there; the layer's creation and
 *    the stroke undo as two entries.
 *  - Eraser on a paint layer erases it. On the picture layer it paints the picture's mask (erasing the
 *    picture to the paper); `restore` (Alt held) takes the mask away instead.
 *  - The picker never strokes: the stage reads the colour from what it shows.
 */
export interface PaintSessionApi {
  readonly state: SessionState;
  /**
   * Begins a stroke with the armed tool: the layer it paints and the tiles its first dab changed, or null for
   * the picker. When the stroke made a new layer, the caller syncs the compositor's layer list before drawing.
   */
  beginStroke(first: PenSample, opts?: { restore?: boolean }): { layerId: string; keys: number[] } | null;
  /** Returns the tile keys that changed on the stroked layer, for the compositor. */
  addSamples(samples: PenSample[]): number[];
  /** Ends the stroke; returns the tiles the end changed (a lone tap's dab, wet edges settling). */
  endStroke(): number[];
  /** Whether the layers panel may offer Delete and Merge down for this layer. */
  canDelete(id: string): boolean;
  canMergeDown(id: string): boolean;
  addLayer(): PaintLayer;
  deleteLayer(id: string): void;
  moveLayer(id: string, toIndex: number): void;
  mergeDown(id: string): void;
  setLayerProps(id: string, props: Partial<Pick<PaintLayer, "name" | "blend" | "opacity" | "visible" | "lockAlpha">>): void;
  undo(): { layerIds: string[] } | null;
  redo(): { layerIds: string[] } | null;
  readonly canUndo: boolean;
  readonly canRedo: boolean;
  /**
   * The tiles changed on each paint layer since the session started or `markClean`, from strokes, undo, redo and
   * merges. Loading a saved painting marks nothing. The save path uploads only the chunks these fall in.
   */
  readonly dirty: ReadonlyMap<string, ReadonlySet<number>>;
  markClean(): void;
  /**
   * Forgets the changed tiles without calling the session saved: the caller has just made the layers equal to a
   * stored baseline (Go back to a version), so nothing is left to upload. Undo and redo mark their tiles again.
   */
  rebase(): void;
  /** Anything changed since the painting was loaded or last saved. Undo counts: it cannot tell it came back to the saved state. */
  readonly edited: boolean;
  /**
   * Swaps every paint layer for these (the picture layer stays) as one history step, so one undo brings the old
   * ones back. Returns the ids to redraw. A blank sheet keeps one paint layer to paint on.
   */
  replaceLayers(next: PaintLayer[]): string[];
}
