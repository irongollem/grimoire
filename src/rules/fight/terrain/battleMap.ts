// The battle map of a fight as the rules see it: which walls and closed doors block, which squares are solid rock,
// which are difficult ground. Pure and edge-importable (relative `.ts` imports only).
//
// It is assembled by the very functions the Play screen uses (`resolveBattleSurface` for which map, `terrainZonesOf`
// for which zones, `occludersOf` for walls and doors), so a fight in a room on the server sees exactly the walls,
// doors and difficult squares the DM's screen does. Nothing here is a second reading of the map.

import { NO_OCCLUDERS, occludersOf, type Occluders } from "../../../lib/battlemap/occlusion.ts";
import { resolveBattleSurface, type PlanRegion, type SurfaceLocation } from "../../../lib/battlemap/roomBridge.ts";
import { terrainZonesOf } from "../../../lib/battlemap/terrainZones.ts";
import type { GridCalibration } from "../../../types/location.types.ts";
import type { MapLiveDoorState } from "../../../types/mapLive.types.ts";
import type { ReachInput } from "./reach.ts";

export interface FightMapInput {
  /** The place the encounter is anchored to. */
  encounterLocation: SurfaceLocation | null;
  /** Its parent, when it is an interior space (a room) that may live on its site's plan. */
  parent: SurfaceLocation | null;
  /** The regions of the encounter's site (`useLocationBattleSurface`'s `siteId`: the parent of an interior, else the place). */
  regions: readonly PlanRegion[];
  /** `map_memory.door_states` of the map place: what the DM opened or shut in play. */
  doorStates: readonly MapLiveDoorState[];
}

export interface FightMap {
  /** The place whose map the fight is on: the room's parent site when the room has no map of its own. */
  mapLocationId: string;
  /** Walls and the doors that are not open, plus solid cells, in image cells. */
  occluders: Occluders;
  /** Cells (`"x,y"`, image cells) with a movement cost above 1, from the zones the fight crosses. */
  difficult: ReadonlySet<string>;
  /** Solid rock cells (`"x,y"`). */
  solid: ReadonlySet<string>;
  calibration: GridCalibration;
}

/**
 * The fight's map, or null when it has none the rules can use: no place, no calibrated map, or a map whose live
 * snapshot is of an older version (`currentVersionOf`): that site has walls the rules cannot read, and treating it
 * as open ground would walk creatures through all of them until it is published again.
 *
 * A calibrated map with NO snapshot at all is a different thing and is a map: a picture with a grid and nothing
 * drawn over it. It has no walls, as on the Play screen, so everything on it is open ground.
 */
export function fightMapOf(input: FightMapInput): FightMap | null {
  const surface = resolveBattleSurface({
    encounterLocation: input.encounterLocation,
    parent: input.parent,
    regions: input.regions,
  });
  if (surface === null) return null;
  if (surface.live === null && surface.mapLocation.map_live !== null) return null;
  const occluders = surface.live === null ? NO_OCCLUDERS : occludersOf(surface.live, input.doorStates);
  const difficult = new Set(terrainZonesOf(input.regions, surface).flatMap((z) => z.battleCells));
  return {
    mapLocationId: surface.mapLocation.id,
    occluders,
    difficult,
    solid: occluders.solid,
    calibration: surface.calibration,
  };
}

/** The terrain `reachableCells` takes: the same walls and closed doors, solid rock and difficult squares. */
export function reachTerrainOf(map: FightMap): ReachInput["terrain"] {
  return { difficult: map.difficult, blocking: map.occluders.segments, solid: map.solid };
}
