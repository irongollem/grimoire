// ── The Prepared layer's marks (#868, S8, frames 10-11 of the quest/atlas
// design) ─────────────────────────────────────────────────────────────────
//
// Traps, features, puzzles, encounters and loot are already authored,
// already reusable, and already anchored — to a room by `location_placements`,
// to a cell by `source_cell_key`, or to a host feature. This module is the
// one place that turns those anchors into a drawable point: everything the
// map layer (`MapPreparedLayer.vue`) and the reverse "Placed in" columns
// (Dungeon Craft's grid cards) read agrees with what a DM sees on the plan,
// because both read the same resolution.
//
// The two anchors, reconciled: a cell wins on position (source_cell_key, when
// set, always draws there); a room wins on membership (no cell = draw at the
// room's own centroid). A mark with neither is dropped — there is nowhere on
// the plan to put it. Roll tables and loot tables are placements too, but
// never get a marker (frame 10: "no markers for tables").
//
// Kept pure and dependency-free beyond `planSvg`'s `centroid` — same reason
// that module stays pure: this needs to be testable without mounting Vue or
// touching Supabase, and `useSitePrepared` is the only thing that gathers the
// live rows this receives.

import { centroid } from "@/lib/locations/planSvg";
import { cellKey } from "@/types/dungeonMap.types";
import type { CellKey } from "@/types/dungeonMap.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import { placementKind } from "@/types/locationPlacement.types";
import type { LocationPlacementWithEntity } from "@/composables/locations/useLocationPlacements";
import type { Trap, HazardGlyph } from "@/types/trap.types";
import { HAZARD_GLYPH_LABELS } from "@/types/trap.types";
import type { DungeonFeature, DungeonFeatureType, FeatureGlyph } from "@/types/dungeonFeature.types";
import { FEATURE_GLYPH_LABELS } from "@/types/dungeonFeature.types";
import type { PuzzleRoom } from "@/types/puzzle.types";
import type { Encounter } from "@/types/encounter.types";
import type { LootPlacement } from "@/types/quest.types";
import {
  IconAnnounce,
  IconArch,
  IconCave,
  IconCube,
  IconDoor,
  IconDungeon,
  IconEncounter,
  IconFire,
  IconGrid,
  IconLandmark,
  IconLink,
  IconLoot,
  IconNetwork,
  IconPackage,
  IconPickaxe,
  IconPuzzle,
  IconRect,
  IconScrollText,
  IconStar,
  IconSword,
  IconTool,
  IconTrap,
  IconUser,
  IconWall,
  IconWater,
} from "@/lib/icons";
import type { AppIcon } from "@/lib/icons";

export const PREPARED_MARK_KINDS = ["trap", "feature", "secret_feature", "puzzle", "encounter", "loot"] as const;
export type PreparedMarkKind = (typeof PREPARED_MARK_KINDS)[number];

/** A dot's colour and a bar's colour already have a legend (`SiteMapLegend`);
 *  these six join it when the Prepared layer is on. Exact values from frame 10. */
export const MARK_COLOURS: Record<PreparedMarkKind, string> = {
  trap: "#dc2626",
  feature: "#a16207",
  secret_feature: "#7c3aed",
  puzzle: "#0d9488",
  encounter: "#b45309",
  loot: "#ca8a04",
};

/** The disc's ring — every kind shares it, frame 10. */
export const MARK_RING_COLOUR = "#faf3e2";

/** The legend line under the map, when the Prepared layer is on. */
export const PREPARED_MARK_KIND_LABELS: Record<PreparedMarkKind, string> = {
  trap: "Trap",
  feature: "Feature",
  secret_feature: "Secret feature",
  puzzle: "Puzzle",
  encounter: "Encounter",
  loot: "Loot cache",
};

/** Disc radius, in grid-cell units (the same unit `cell` positions are in). */
export const MARK_RADIUS_CELLS = 0.36;

/** How far a mark sharing a cell with an earlier one shifts, in cell-x units
 *  (frame 10: "two marks on one cell fan out slightly"). */
export const MARK_FAN_STEP_CELLS = 0.3;

/**
 * One glyph per `HazardGlyph` (#804) for the plan marker. There is no SVG
 * hazard-glyph set (`src/cartographer/glyphs.ts` maps to canvas tile
 * categories, not icons) — these are the app's own icon set standing in, per
 * the frame's own rule: the glyph says what the trap IS, the icon is only how
 * the renderer draws that.
 */
export const HAZARD_MARK_ICON: Record<HazardGlyph, AppIcon> = {
  pit: IconCave,
  pressure_plate: IconRect,
  tripwire: IconLink,
  falling_block: IconCube,
  dart_wall: IconWall,
  blade: IconSword,
  flame_jet: IconFire,
  glyph: IconStar,
  net: IconNetwork,
  alarm: IconAnnounce,
  collapsing_floor: IconGrid,
};

/** Same idea, for `FeatureGlyph`. */
export const FEATURE_MARK_ICON: Record<FeatureGlyph, AppIcon> = {
  secret_door: IconDoor,
  hidden_passage: IconArch,
  cache: IconPackage,
  moving_wall: IconWall,
  lever: IconTool,
  altar: IconLandmark,
  fountain: IconWater,
  statue: IconUser,
  rubble: IconPickaxe,
  inscription: IconScrollText,
};

/** Falls back to a generic per-kind glyph when the entity has no `hazard_glyph`
 *  / `feature_glyph` set yet, or for kinds that were never glyph-typed at all
 *  (a puzzle, an encounter, a loot cache). */
const KIND_FALLBACK_ICON: Record<PreparedMarkKind, AppIcon> = {
  trap: IconTrap,
  feature: IconDungeon,
  secret_feature: IconDungeon,
  puzzle: IconPuzzle,
  encounter: IconEncounter,
  loot: IconLoot,
};

/** Connection-type features withhold a way out rather than guard treasure —
 *  frame 10's violet "secret feature" colour is this distinction, not a
 *  second glyph taxonomy. */
const SECRET_FEATURE_TYPES = new Set<DungeonFeatureType>(["Secret Door", "Hidden Passage", "Moving Wall"]);

export interface PreparedMark {
  id: string;
  kind: PreparedMarkKind;
  /** Where this mark draws. Null only transiently — `resolvePreparedMarks`
   *  never returns a mark with a null cell; a mark that resolves to neither a
   *  cell nor a room centroid is dropped instead (frame 10: puzzles "on
   *  neither, nowhere"). */
  cell: CellKey;
  /** The room this reads as prepared in, for the reverse "Placed in" column
   *  and for grouping — null for a puzzle anchored purely through a feature
   *  that has since lost its own room (shouldn't happen in practice;
   *  `location_placements` requires a location), and for a hazard zone's
   *  linked trap, which belongs to the zone rather than to any one room. */
  spaceId: string | null;
  label: string;
  subtitle: string;
  icon: AppIcon;
  colour: string;
  /** Where clicking this mark navigates. */
  href: string;
  /** Cell-x offset (in cell units) for a mark sharing a cell with one drawn
   *  before it — 0 for the first mark on any given cell. */
  fanOffset: number;
}

export interface PreparedMarksInput {
  /** Every trap/feature/roll-table/loot-table placement across the site
   *  (`useSitePlacements`) — roll and loot tables are filtered out here,
   *  never drawn. */
  placements: LocationPlacementWithEntity[];
  traps: Trap[];
  features: DungeonFeature[];
  /** Already scoped to this site's rooms and this site's hosting features. */
  puzzles: PuzzleRoom[];
  /** Already scoped to this site's rooms. */
  encounters: Encounter[];
  /** Already scoped to this site's rooms. */
  lootPlacements: LootPlacement[];
  regions: LocationMapRegion[];
}

/** The centre of a room's traced shape, rounded to the nearest whole cell —
 *  `centroid()` returns a cell-space point that need not land on a cell
 *  boundary, and a mark draws on one cell like everything else on this
 *  layer. Null when the room has no bound region yet, or the region has no
 *  cells traced. */
function roomCentroidCell(region: LocationMapRegion | undefined): CellKey | null {
  if (!region || region.cells.length === 0) return null;
  const point = centroid(region.cells);
  if (!point) return null;
  const [x, y] = point;
  return cellKey(Math.round(x - 0.5), Math.round(y - 0.5));
}

function trapSubtitle(trap: Trap): string {
  const bits: string[] = [];
  if (trap.hazard_glyph) bits.push(HAZARD_GLYPH_LABELS[trap.hazard_glyph]);
  if (trap.detection_dc != null) bits.push(`DC ${trap.detection_dc}`);
  return bits.join(" · ") || "Trap";
}

function featureSubtitle(feature: DungeonFeature): string {
  const bits: string[] = [];
  if (feature.feature_glyph) bits.push(FEATURE_GLYPH_LABELS[feature.feature_glyph]);
  if (feature.investigation_dc != null) bits.push(`Investigation DC ${feature.investigation_dc}`);
  else if (feature.perception_dc != null) bits.push(`Perception DC ${feature.perception_dc}`);
  return bits.join(" · ") || feature.feature_type;
}

function lootSubtitle(loot: LootPlacement): string {
  switch (loot.kind) {
    case "item": return loot.label || "Item";
    case "currency": return loot.label || "Currency";
    case "loot_chest": return "Loot chest";
  }
}

/**
 * Resolves every prepared mark a site's plan should draw. Order in the
 * output is placements (traps, then features) → hazard-zone-linked traps →
 * puzzles → encounters → loot, then fanned out — deterministic so the same
 * input always produces the same marks, which is what the fan-out and the
 * tests below rely on.
 */
export function resolvePreparedMarks(input: PreparedMarksInput): PreparedMark[] {
  const trapsById = new Map(input.traps.map((t) => [t.id, t]));
  const featuresById = new Map(input.features.map((f) => [f.id, f]));
  const regionsBySpace = new Map(
    input.regions
      .filter((r) => r.region_role === "space" && r.space_location_id)
      .map((r) => [r.space_location_id as string, r]),
  );
  // A puzzle hosted by a feature draws wherever that feature itself draws
  // (frame 10: "a puzzle on a feature draws at that feature's cell") — so it
  // needs the feature's own placement, not just the feature row.
  const featurePlacementByFeatureId = new Map<string, LocationPlacementWithEntity>();
  for (const placement of input.placements) {
    if (placementKind(placement) === "dungeon_feature" && placement.dungeon_feature_id) {
      featurePlacementByFeatureId.set(placement.dungeon_feature_id, placement);
    }
  }

  const marks: PreparedMark[] = [];

  for (const placement of input.placements) {
    const kind = placementKind(placement);
    if (kind === "roll_table" || kind === "loot_table") continue; // never drawn

    if (kind === "trap") {
      const trap = trapsById.get(placement.trap_id!);
      if (!trap) continue;
      const cell = placement.source_cell_key ?? roomCentroidCell(regionsBySpace.get(placement.location_id));
      if (!cell) continue;
      marks.push({
        id: `trap:${placement.id}`,
        kind: "trap",
        cell,
        spaceId: placement.location_id,
        label: trap.name,
        subtitle: trapSubtitle(trap),
        icon: trap.hazard_glyph ? HAZARD_MARK_ICON[trap.hazard_glyph] : KIND_FALLBACK_ICON.trap,
        colour: MARK_COLOURS.trap,
        href: `/traps/${trap.id}`,
        fanOffset: 0,
      });
    } else if (kind === "dungeon_feature") {
      const feature = featuresById.get(placement.dungeon_feature_id!);
      if (!feature) continue;
      const isSecret = SECRET_FEATURE_TYPES.has(feature.feature_type);
      const markKind: PreparedMarkKind = isSecret ? "secret_feature" : "feature";
      const cell = placement.source_cell_key ?? roomCentroidCell(regionsBySpace.get(placement.location_id));
      if (!cell) continue;
      marks.push({
        id: `feature:${placement.id}`,
        kind: markKind,
        cell,
        spaceId: placement.location_id,
        label: feature.name,
        subtitle: featureSubtitle(feature),
        icon: feature.feature_glyph ? FEATURE_MARK_ICON[feature.feature_glyph] : KIND_FALLBACK_ICON[markKind],
        colour: MARK_COLOURS[markKind],
        href: `/dungeon-features/${feature.id}`,
        fanOffset: 0,
      });
    }
  }

  // Hazard zones drawing their own linked trap (frame 07: "may carry
  // `trap_id`, in which case the trap's own `hazard_glyph` draws inside it
  // instead of a flat fill") — the flat fill itself is `drawZonesPass`'s
  // job, still painted underneath; this only resolves where the glyph goes.
  // Drawn at the zone's own centroid, not any room's — a hazard zone need
  // not sit inside a single bound space at all.
  for (const region of input.regions) {
    if (region.region_role !== "zone" || region.zone_kind !== "hazard") continue;
    const trapId = region.zone_payload.trap_id;
    if (!trapId) continue;
    const hazardTrap = trapsById.get(trapId);
    if (!hazardTrap) continue;
    const cell = roomCentroidCell(region);
    if (!cell) continue;
    marks.push({
      id: `zone-trap:${region.id}`,
      kind: "trap",
      cell,
      spaceId: null,
      label: hazardTrap.name,
      subtitle: trapSubtitle(hazardTrap),
      icon: hazardTrap.hazard_glyph ? HAZARD_MARK_ICON[hazardTrap.hazard_glyph] : KIND_FALLBACK_ICON.trap,
      colour: MARK_COLOURS.trap,
      href: `/traps/${hazardTrap.id}`,
      fanOffset: 0,
    });
  }

  for (const puzzle of input.puzzles) {
    let cell: CellKey | null = null;
    let spaceId: string | null = null;
    if (puzzle.dungeon_feature_id) {
      const hostPlacement = featurePlacementByFeatureId.get(puzzle.dungeon_feature_id);
      if (hostPlacement) {
        spaceId = hostPlacement.location_id;
        cell = hostPlacement.source_cell_key ?? roomCentroidCell(regionsBySpace.get(hostPlacement.location_id));
      }
    } else if (puzzle.location_id) {
      spaceId = puzzle.location_id;
      cell = roomCentroidCell(regionsBySpace.get(puzzle.location_id));
    }
    if (!cell) continue; // on neither, nowhere
    marks.push({
      id: `puzzle:${puzzle.id}`,
      kind: "puzzle",
      cell,
      spaceId,
      label: puzzle.name,
      subtitle: puzzle.puzzle_type,
      icon: KIND_FALLBACK_ICON.puzzle,
      colour: MARK_COLOURS.puzzle,
      href: `/puzzles/${puzzle.id}`,
      fanOffset: 0,
    });
  }

  for (const encounter of input.encounters) {
    if (!encounter.location_id) continue;
    const cell = roomCentroidCell(regionsBySpace.get(encounter.location_id));
    if (!cell) continue;
    marks.push({
      id: `encounter:${encounter.id}`,
      kind: "encounter",
      cell,
      spaceId: encounter.location_id,
      label: encounter.name,
      subtitle: encounter.combatants.length === 1 ? "1 combatant" : `${encounter.combatants.length} combatants`,
      icon: KIND_FALLBACK_ICON.encounter,
      colour: MARK_COLOURS.encounter,
      href: `/encounters/${encounter.id}`,
      fanOffset: 0,
    });
  }

  for (const loot of input.lootPlacements) {
    if (!loot.location_id) continue;
    const cell = roomCentroidCell(regionsBySpace.get(loot.location_id));
    if (!cell) continue;
    marks.push({
      id: `loot:${loot.id}`,
      kind: "loot",
      cell,
      spaceId: loot.location_id,
      label: loot.label || "Loot cache",
      subtitle: lootSubtitle(loot),
      icon: KIND_FALLBACK_ICON.loot,
      colour: MARK_COLOURS.loot,
      href: `/locations/${loot.location_id}`,
      fanOffset: 0,
    });
  }

  return fanOutSharedCells(marks);
}

/** Marks sharing a cell fan out along x so neither disc fully hides the
 *  other (frame 10). Grouped by `id` order (already deterministic — the
 *  placements → puzzles → encounters → loot order `resolvePreparedMarks`
 *  builds them in) so the same input always fans out the same way. */
function fanOutSharedCells(marks: PreparedMark[]): PreparedMark[] {
  const byCell = new Map<CellKey, PreparedMark[]>();
  for (const mark of marks) {
    const group = byCell.get(mark.cell);
    if (group) group.push(mark);
    else byCell.set(mark.cell, [mark]);
  }
  for (const group of byCell.values()) {
    group.forEach((mark, index) => {
      mark.fanOffset = index * MARK_FAN_STEP_CELLS;
    });
  }
  return marks;
}
