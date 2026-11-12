import type { BrushPreset, GrainImage, TipImage } from "../engine/types";

/*
 * What the brush importers hand back (#1181). Pure data: nothing here touches the DOM, the asset
 * store or the network, so the same code runs in the browser and under Node tests.
 */

export interface ImportedBrush {
  /** Group "yours". Tip and grain ids are local to this import ("import:<n>:tip"); the caller re-keys them on save. */
  preset: BrushPreset;
  /** Null for a computed round tip. */
  tip: TipImage | null;
  grain: GrainImage | null;
  /** Settings that did not carry over, in plain words. */
  notes: string[];
}

export interface SkippedBrush {
  name: string;
  reason: string;
}

export interface ImportResult {
  brushes: ImportedBrush[];
  skipped: SkippedBrush[];
}

export interface PngPixels {
  width: number;
  height: number;
  /** Row by row, four bytes a pixel. */
  rgba: Uint8Array;
}

export interface ImportLimits {
  maxFileBytes: number;
  maxEntries: number;
  /** Total bytes an archive may inflate to, by its own header and by what actually comes out. */
  maxInflatedBytes: number;
  /** A tip or grain larger than this on its long side is scaled down. */
  maxTipSide: number;
  /** An image with more pixels than this is refused before anything is allocated for it. */
  maxPixels: number;
}

export const IMPORT_LIMITS: ImportLimits = {
  maxFileBytes: 50 * 1024 * 1024,
  maxEntries: 500,
  maxInflatedBytes: 200 * 1024 * 1024,
  maxTipSide: 1024,
  maxPixels: 64 * 1024 * 1024,
};

export interface ImportOptions {
  /** The browser passes a canvas-backed decoder; the default is a small pure one. */
  decodePng?: (bytes: Uint8Array) => PngPixels;
  limits?: ImportLimits;
}

/** A file problem worth telling the painter about. Caught at the edge of the importer and turned into a `skipped` entry. */
export class ImportError extends Error {}
