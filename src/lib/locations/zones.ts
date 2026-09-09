// Zone read-outs for the site map plan (#868, frame 07 "Zones").
//
// A zone is a `location_map_regions` row with `region_role: "zone"` — the
// same geometry a space uses, carrying a role instead of a binding (see
// `RegionRole`'s docstring in `locationMapRegion.types.ts`). This module owns
// the pure bits a zone-aware UI needs and nothing about rendering or
// mutating: `MapRegionsLayer.vue` reads `ZONE_KIND_FILL` to paint, and
// `SiteMapZoneList.vue` reads `zoneSummary`/`isPlayerVisible` to render a row.
//
// Deliberately no enforcement here, echoing `ZonePayload`'s own docstring: a
// difficult-terrain zone *reads* as difficult terrain and halves nobody's
// speed. This file only turns a payload into words and colours.

import type { LocationMapRegion, LocationMapRegionInsert, ZoneKind, ZonePayload } from "@/types/locationMapRegion.types";
import { ZONE_KIND_LABELS } from "@/types/locationMapRegion.types";

/**
 * Fill/stroke pair per zone kind, matching the design's `sa-plan.js` ZC
 * table: fill at roughly .30 alpha, stroke at roughly .85-.9 so a zone reads
 * as a distinct wash under the dashed outline `MapRegionsLayer` draws for
 * every zone (never a solid edge, so a zone never reads as a room).
 */
export const ZONE_KIND_FILL: Record<ZoneKind, { fill: string; stroke: string }> = {
  terrain: { fill: "rgba(56, 189, 248, 0.30)", stroke: "rgba(56, 189, 248, 0.85)" },
  hazard: { fill: "rgba(251, 146, 60, 0.32)", stroke: "rgba(251, 146, 60, 0.9)" },
  light: { fill: "rgba(139, 92, 246, 0.30)", stroke: "rgba(167, 139, 250, 0.9)" },
  trigger: { fill: "rgba(244, 63, 94, 0.30)", stroke: "rgba(244, 63, 94, 0.9)" },
  marker: { fill: "rgba(120, 113, 108, 0.30)", stroke: "rgba(168, 162, 158, 0.85)" },
};

/** Terrain's `movement_cost` picker — 1x is worth spelling out explicitly
 *  rather than leaving the column unset, since an unset cost and an explicit
 *  "no extra cost" read identically to a DM re-opening the row. */
export const TERRAIN_MOVEMENT_COSTS = [
  { value: 1, label: "1× (normal)" },
  { value: 2, label: "2× (difficult terrain)" },
  { value: 3, label: "Impassable" },
] as const;

/** `light_level` options, in the same order `ZonePayload` documents them. */
export const LIGHT_LEVELS = [
  { value: "bright", label: "Bright" },
  { value: "dim", label: "Dim" },
  { value: "dark", label: "Dark" },
  { value: "magical_darkness", label: "Magical darkness" },
] as const satisfies ReadonlyArray<{ value: NonNullable<ZonePayload["light_level"]>; label: string }>;

/**
 * The one-line read-out for a zone row — "difficult terrain · 3 ft",
 * "darkness", "trap linked", "prompts a beat" — falling back to the kind's
 * own label when the payload has nothing more specific to say yet (a
 * freshly-drawn zone before its editor has been touched).
 */
export function zoneSummary(region: Pick<LocationMapRegion, "zone_kind" | "zone_payload">): string {
  const kind = region.zone_kind;
  if (!kind) return "";
  const payload = region.zone_payload;

  switch (kind) {
    case "terrain": {
      const parts: string[] = [];
      if (payload.movement_cost === 3) parts.push("impassable");
      else if (payload.movement_cost && payload.movement_cost > 1) parts.push("difficult terrain");
      if (payload.depth_ft) parts.push(`${payload.depth_ft} ft`);
      return parts.length ? parts.join(" · ") : ZONE_KIND_LABELS.terrain;
    }
    case "light":
      switch (payload.light_level) {
        case "bright":
          return "bright light";
        case "dim":
          return "dim light";
        case "dark":
          return "darkness";
        case "magical_darkness":
          return "magical darkness";
        default:
          return ZONE_KIND_LABELS.light;
      }
    case "hazard":
      return payload.trap_id ? "trap linked" : ZONE_KIND_LABELS.hazard;
    case "trigger":
      return payload.encounter_id || payload.beat_id ? "prompts a beat" : ZONE_KIND_LABELS.trigger;
    case "marker":
      return ZONE_KIND_LABELS.marker;
  }
}

/** Zones are DM ink by default (`ZonePayload.visible_to_players`'s own
 *  docstring) — absence means false, not unknown, so a fresh zone's chip
 *  reads "DM" rather than a third, indeterminate state. */
export function isPlayerVisible(region: Pick<LocationMapRegion, "zone_payload">): boolean {
  return region.zone_payload.visible_to_players === true;
}

/** A freshly-drawn, unnamed zone ready for `useCreateLocationMapRegion` —
 *  the zone twin of `SiteMapRegionList`'s `addUnboundRegion`. `space_location_id`
 *  is omitted rather than set to null: the column default already is null,
 *  and a zone binding to a space at all is what the DB trigger refuses. */
export function emptyZoneInsert(siteId: string, kind: ZoneKind): LocationMapRegionInsert {
  return {
    site_location_id: siteId,
    region_role: "zone",
    zone_kind: kind,
    zone_payload: {},
  };
}
