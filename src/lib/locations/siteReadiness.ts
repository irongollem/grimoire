// ── Site readiness: the DM's pre-session gap check (#868, frame 02) ──────────
//
// "Floor plan" callout beside the scale rail: five short pills that say what
// a site is missing before a session, not during one — the site analogue of
// the Quest Board's gap chips. Everything here is pure derivation over data
// `useSiteStructure` already gathers; nothing here writes anything.
//
// This module also holds `structureFromSite` and `publishStaleness`, the
// other half of the frame-03 "stale" strip: reconstructing a `DerivedStructure`
// from the Atlas's OWN regions/doors so it can be diffed against the live
// Cartographer drawing with the same `structureDelta` the publish review uses.

import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import type { DungeonMap } from "@/types/dungeonMap.types";
import { deriveStructure, structureDelta } from "@/cartographer/structure";
import type { DerivedStructure, DerivedWay } from "@/cartographer/structure.types";
import { cellSignature } from "@/cartographer/cellSignature";

// ── Readiness ─────────────────────────────────────────────────────────────

export interface ReadinessSpace {
  id: string;
}

export interface ReadinessDoor {
  from_location_id: string;
}

export interface SiteReadinessInput {
  location: {
    map_url: string | null;
    grid_calibration: GridCalibration | null;
  };
  /** This site's bindable children — rooms and nested sites alike. */
  spaces: readonly ReadinessSpace[];
  regions: readonly LocationMapRegion[];
  doors: readonly ReadinessDoor[];
}

export interface SiteReadiness {
  mapped: boolean;
  calibrated: boolean;
  traced: boolean;
  bound: boolean;
  waysOut: boolean;
  /** Traced `space`-role regions with no `space_location_id` — drawn, not named. */
  unboundSpaces: number;
  /** Bindable children with no region bound to them at all — named nowhere on the map. */
  untracedSpaces: number;
  /** The single most pressing gap, or null when `bound` holds cleanly. */
  caption: string | null;
}

/**
 * Five checks in a fixed order: mapped, calibrated, traced, bound, ways out.
 * `bound` reads two different gaps under one flag — a region traced but never
 * bound to a room, and a room with no region at all — because a DM fixing
 * either one is doing the same job: making the floor plan agree with the room
 * list. `caption` reports whichever is more actionable first: an unbound
 * shape is a one-click fix (pick a room), while an untraced room needs new
 * ink drawn, so the cheaper fix leads.
 */
export function siteReadiness(input: SiteReadinessInput): SiteReadiness {
  const { location, spaces, regions, doors } = input;
  const tracedRegions = regions.filter((r) => r.region_role === "space" && r.cells.length > 0);

  const unboundSpaces = tracedRegions.filter((r) => r.space_location_id === null).length;
  const boundSpaceIds = new Set(
    tracedRegions
      .map((r) => r.space_location_id)
      .filter((id): id is string => id !== null),
  );
  const untracedSpaces = spaces.filter((s) => !boundSpaceIds.has(s.id)).length;

  const mapped = !!location.map_url;
  const calibrated = !!location.grid_calibration;
  const traced = tracedRegions.length > 0;
  const bound = unboundSpaces === 0 && untracedSpaces === 0;
  const waysOut = doors.length > 0;

  let caption: string | null = null;
  if (unboundSpaces > 0) {
    caption = `${unboundSpaces} space${unboundSpaces === 1 ? "" : "s"} unbound`;
  } else if (untracedSpaces > 0) {
    caption = `${untracedSpaces} room${untracedSpaces === 1 ? "" : "s"} untraced`;
  }

  return { mapped, calibrated, traced, bound, waysOut, unboundSpaces, untracedSpaces, caption };
}

// ── Publish staleness (frame 03) ─────────────────────────────────────────────

/**
 * Rebuilds a minimal `DerivedStructure` from what the Atlas itself already
 * holds — its traced `space` regions and its doors' `source_edge_key`s — so
 * it can stand as the "before" side of `structureDelta` against a fresh
 * `deriveStructure(map)`. Only the fields `structureDelta` actually reads
 * (`signature`/`cells` on a space, `edgeKey` on a way) need to be genuine;
 * `fromKey`/`toKey` are never compared by that function, so a placeholder is
 * honest rather than a guess.
 */
export function structureFromSite(
  regions: readonly LocationMapRegion[],
  doors: readonly { source_edge_key: SourceEdgeKey | null }[],
): DerivedStructure {
  const spaceRegions = regions.filter((r) => r.region_role === "space" && r.cells.length > 0);
  const spaces = spaceRegions.map((r) => ({
    key: `s:${r.id}`,
    cells: r.cells,
    signature: r.cell_signature ?? cellSignature(r.cells),
    name: r.label,
    nameSource: null,
  }));
  const ways: DerivedWay[] = doors
    .filter((d): d is { source_edge_key: NonNullable<typeof d.source_edge_key> } => d.source_edge_key !== null)
    .map((d) => ({
      edgeKey: d.source_edge_key,
      kind: "door",
      fromKey: "",
      toKey: "",
    }));
  return { spaces, ways, stairs: [], zones: [], links: [] };
}

export interface PublishStaleness {
  /** How many revs behind the live drawing the last publish is. */
  behind: number;
  delta: ReturnType<typeof structureDelta>;
}

/**
 * Null when there is nothing to compare (no source map, or the last publish
 * already carries the map's current rev) — the fresh state `SiteMapSourceStrip`
 * renders instead of the stale variant.
 */
export function publishStaleness(
  location: { map_published_rev: number | null },
  map: Pick<DungeonMap, "rev" | "layers" | "metadata"> | null | undefined,
  before: DerivedStructure,
): PublishStaleness | null {
  if (!map || location.map_published_rev === null) return null;
  const behind = map.rev - location.map_published_rev;
  if (behind <= 0) return null;
  return { behind, delta: structureDelta(before, deriveStructure(map)) };
}
