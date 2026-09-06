// Trap / feature visual glyphs (#804) — resolves a placed entity's
// hazard_glyph / feature_glyph to the tile-pack category that draws it.
//
// Deliberately NOT persisted anywhere on the map: a trap says what it IS
// (src/types/trap.types.ts), and this module is the one place that decides
// how that draws given whichever pack is loaded — the same separation
// `location_type` -> colour already uses. Resolving it live off the current
// trap/feature row (rather than baking a category into CellMetadata at
// placement time) means editing a trap's glyph updates every map it's
// placed on without touching map data at all.

import type { PackCategory } from "./packSchema";
import type { HazardGlyph } from "@/types/trap.types";
import type { FeatureGlyph } from "@/types/dungeonFeature.types";
import type { CellKey, CellMetadata } from "@/types/dungeonMap.types";

export const HAZARD_GLYPH_CATEGORY: Record<HazardGlyph, PackCategory> = {
  pit:              "hazardPit",
  pressure_plate:   "hazardPressurePlate",
  tripwire:         "hazardTripwire",
  falling_block:    "hazardFallingBlock",
  dart_wall:        "hazardDartWall",
  blade:            "hazardBlade",
  flame_jet:        "hazardFlameJet",
  glyph:            "hazardGlyph",
  net:              "hazardNet",
  alarm:            "hazardAlarm",
  collapsing_floor: "hazardCollapsingFloor",
};

export const FEATURE_GLYPH_CATEGORY: Record<FeatureGlyph, PackCategory> = {
  secret_door:    "featureSecretDoor",
  hidden_passage: "featureHiddenPassage",
  cache:          "featureCache",
  moving_wall:    "featureMovingWall",
  lever:          "featureLever",
  altar:          "featureAltar",
  fountain:       "featureFountain",
  statue:         "featureStatue",
  rubble:         "featureRubble",
  inscription:    "featureInscription",
};

/** Drawn for a placed trap/feature whose glyph is null — a null glyph is a
 *  legitimate, unset state, not an absence to render as nothing. */
export const GENERIC_HAZARD_CATEGORY: PackCategory = "hazardGeneric";
export const GENERIC_FEATURE_CATEGORY: PackCategory = "featureGeneric";

/**
 * Resolves every cell that links a trap or feature to the PackCategory that
 * draws it, reading the CURRENT hazard_glyph/feature_glyph off the live
 * trap/feature row rather than anything stored on the cell itself.
 *
 * `trapsById`/`featuresById` only need the one field each — callers pass a
 * `Map` keyed by id (built with `includeAllScopes: true`, since a placement
 * must keep resolving even after its target is scoped out of the active
 * campaign, same rule as `location_placements`).
 *
 * A cell that somehow carries both a trap_id and a feature_id (the type
 * permits it; nothing else in the app creates it) draws the trap — arbitrary
 * but deterministic, and worth a glance if it ever actually happens.
 */
export function resolveCellGlyphs(
  metadata: Record<CellKey, CellMetadata>,
  trapsById: Map<string, { hazard_glyph: HazardGlyph | null }>,
  featuresById: Map<string, { feature_glyph: FeatureGlyph | null }>,
): Record<CellKey, PackCategory> {
  const out: Record<CellKey, PackCategory> = {};
  for (const key of Object.keys(metadata) as CellKey[]) {
    const meta = metadata[key];
    if (!meta) continue;
    if (meta.trap_id) {
      const glyph = trapsById.get(meta.trap_id)?.hazard_glyph;
      out[key] = glyph ? HAZARD_GLYPH_CATEGORY[glyph] : GENERIC_HAZARD_CATEGORY;
    } else if (meta.feature_id) {
      const glyph = featuresById.get(meta.feature_id)?.feature_glyph;
      out[key] = glyph ? FEATURE_GLYPH_CATEGORY[glyph] : GENERIC_FEATURE_CATEGORY;
    }
  }
  return out;
}
