/**
 * The live snapshot a Cartographer publish writes onto a location (`locations.map_live`, epic #1073): what the
 * battle map's live layer needs to animate and later light a site, without reading `dungeon_maps` (players cannot).
 * Every cell key is an image cell: the published Drawing's own cell space, where cell (0,0) is the image's top-left.
 */

import type { SwayMotion } from "@/cartographer/packSchema";
import type { DarknessLevel } from "@/types/dungeonMap.types";

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
  /** Vector water follows its shoreline; higher material shapes hide the water underneath them. Image cells. */
  clip?: MapLiveGroundClip;
}

export interface MapLiveGroundClip {
  outline: [number, number][][];
  /** Each entry is one higher shape, including that shape's holes. */
  occluded: [number, number][][][];
}

/** A light in image cells (centre of the source). */
export interface MapLiveLight {
  x: number;
  y: number;
  color: string;
  bright: number;
  dim: number;
  intensity?: number;
  /** At most one of the two (see `TileLight`): the live layer brightens the steady baked glow by up to this fraction. */
  flicker?: number;
  pulse?: number;
  /** Radians, from the light's position, so neighbouring fires never flicker in lockstep. */
  phase: number;
}

/**
 * A standing thing that sways (a tree, a mushroom): the live layer draws it from `url` instead of the standing
 * bake, which leaves it out. Centre and size are in image cells, `rotation` is the placement's own turn in degrees.
 */
export interface MapLiveSprite {
  url: string;
  /** Centre, fractional image cells. */
  x: number;
  y: number;
  /** Drawn size in cells, before the turn. */
  w: number;
  h: number;
  rotation: number;
  /** `amount` degrees at most, `speed` rad/s, `phase` radians from the position. */
  sway: SwayMotion & { phase: number };
}

/**
 * The snapshot's shape. 3 since walls and doors are segments between two points (#1125 decision 5) instead of grid
 * edge keys; 2 added the door leaf (`MapLiveDoor.leaf`), which the live standing bake leaves out. The battle map reads
 * only the current version, and a stored older snapshot is converted by a migration, not by a reader.
 */
export const MAP_LIVE_VERSION = 3;

/** A wall, or the line of a door, in image cells. A wall on a grid line has its edge key (`"x,y:N"`, `"x,y:W"`) as id. */
export interface MapLiveWall {
  id: string;
  a: [number, number];
  b: [number, number];
}

export interface MapLive {
  version: typeof MAP_LIVE_VERSION;
  /** The map's ambient light at publish time: the battle map's darkness veil reads it. */
  darkness: DarknessLevel;
  groups: MapLiveGroup[];
  lights: MapLiveLight[];
  /** Standing objects first (row-major), then Dressing in draw order: the order they stack in the bake. */
  sprites: MapLiveSprite[];
  /**
   * What stops light and sight, in image cells (epic #1073 story 6): walls and sluices here as segments, solid rock in
   * `solid` (`"x,y"`). A grate blocks nothing and is in neither.
   */
  walls: MapLiveWall[];
  /** Door segments with their drawn state; a door blocks while not open. Kept apart so play can override `open`. */
  doors: MapLiveDoor[];
  solid: string[];
}

/** A door's open or shut state: as drawn in the snapshot, or as the DM set it during a fight. `id` is its segment's. */
export interface MapLiveDoorState {
  id: string;
  open: boolean;
}

/**
 * How the live layer draws a door's leaf at either state: the leaf tile as the bake draws it (`drawEdgeSeg`), closed
 * where it sits in the doorway and open turned `openDegrees` clockwise about the hinge pin (`hingeX`, `hingeY`, 0..1 of
 * the tile). A standing bake made for the live view leaves out exactly the leaves that carry one of these, so a leaf
 * is never drawn twice. Null when the leaf's art has no lasting url (a DM's own pack): the leaf then stays in the bake
 * at its drawn state, and toggling that door changes light and sight but not the picture.
 */
export interface MapLiveDoorLeaf {
  url: string;
  hingeX: number;
  hingeY: number;
  openDegrees: number;
}

export interface MapLiveDoor extends MapLiveDoorState {
  /** The doorway's line in image cells; the leaf spans it, hinged as `leaf` says. */
  a: [number, number];
  b: [number, number];
  leaf: MapLiveDoorLeaf | null;
}
