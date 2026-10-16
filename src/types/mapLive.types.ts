/**
 * The live snapshot a Cartographer publish writes onto a location (`locations.map_live`, epic #1073): what the
 * battle map's live layer needs to animate and later light a site, without reading `dungeon_maps` (players cannot).
 * Every cell key is an image cell: the published Drawing's own cell space, where cell (0,0) is the image's top-left.
 */

/** One animated overlay: a seamless transparent image tiled over a cell group, drifting and breathing. */
export interface MotionOverlay {
  /** Absolute URL in a snapshot; relative to the pack folder in a pack manifest. */
  url: string;
  /** The image repeats every `cells` cells (its drawn size, square). */
  cells: number;
  /** Cells per second, x and y. */
  drift: [number, number];
  /** 0..1 base opacity. */
  alpha: number;
  /** alpha *= 1 + amount * sin(speed * t + phase), clamped 0..1; speed in rad/s. */
  breathe?: { amount: number; speed: number; phase: number };
}

/** Cells that share a motion: a pack's painted water, or the open mass outside the map. Keys are `"x,y"`. */
export interface MapLiveGroup {
  kind: "water" | "outer";
  cells: string[];
  overlays: MotionOverlay[];
}

/** A light in image cells (centre of the source). */
export interface MapLiveLight {
  x: number;
  y: number;
  color: string;
  bright: number;
  dim: number;
  intensity?: number;
}

export interface MapLive {
  version: 1;
  groups: MapLiveGroup[];
  lights: MapLiveLight[];
}
