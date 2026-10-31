// What a line of the Zoning list says (#1125, frames 18-19). `foundRooms.ts` decides WHICH lines there are (a
// real row, or a room the walls found that has no row yet); this turns a line into words and gives the unwritten
// ones an identity the canvas can click.

import type { DerivedSpace } from "@/cartographer/structure.types";
import type { ZoningEntry } from "@/lib/locations/foundRooms";
import { zoneSummary } from "@/lib/locations/zones";
import { ZONE_KIND_LABELS, type LocationMapRegion } from "@/types/locationMapRegion.types";

/** A found room with no row is clicked on the canvas by this id; the click writes the row (`selectRegion`). */
export const FOUND_PREFIX = "found:";

export function foundSpaceKey(regionId: string): string | null {
  return regionId.startsWith(FOUND_PREFIX) ? regionId.slice(FOUND_PREFIX.length) : null;
}

/** A found room dressed as an unbound space, so the canvas draws and hit-tests it like any other room. */
export function foundRegionOf(space: DerivedSpace, siteId: string): LocationMapRegion {
  return {
    id: `${FOUND_PREFIX}${space.key}`,
    user_id: "",
    site_location_id: siteId,
    space_location_id: null,
    cells: space.cells,
    label: space.name,
    sort_order: null,
    region_role: "space",
    zone_kind: null,
    zone_payload: {},
    derived_from: "floodfill",
    cell_signature: space.signature,
    vertices: null,
    created_at: "",
    updated_at: "",
  };
}

export function entryId(entry: ZoningEntry): string {
  return entry.kind === "region" ? entry.region.id : `${FOUND_PREFIX}${entry.space.key}`;
}

export function isRoomEntry(entry: ZoningEntry): boolean {
  return entry.kind === "found" || entry.region.region_role === "space";
}

/** A room the DM has not named or bound reads "Room N", N being its place among the rooms. */
export function roomTitle(entry: ZoningEntry, roomNumber: number, boundName: string | null): { text: string; named: boolean } {
  const given = entry.kind === "found" ? entry.space.name : (boundName ?? entry.region.label);
  const text = given?.trim();
  return text ? { text, named: true } : { text: `Room ${roomNumber}`, named: false };
}

/**
 * The short state under a line's name: "found", "found · renamed", "bound", "terrain · difficult".
 * A row that came from the walls (`cell_signature` set) and was then touched by the DM still says where it came from.
 */
export function zoningState(entry: ZoningEntry): string {
  if (entry.kind === "found") return "found";
  const { region } = entry;
  if (region.region_role === "zone") {
    const kind = region.zone_kind;
    if (!kind) return "zone";
    const word = ZONE_KIND_LABELS[kind].toLowerCase();
    const detail = zoneSummary(region).toLowerCase().replace(word, "").replace(/^\s*·?\s*|\s*$/g, "");
    return detail ? `${word} · ${detail}` : word;
  }
  if (region.space_location_id) return "bound";
  if (entry.found) return entry.changed ? "found · walls moved" : "found";
  if (region.cell_signature !== null) return region.label ? "found · renamed" : "found · reshaped";
  return "not bound yet";
}
