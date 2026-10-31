// Exploring a site on the Play screen (#1125 decision 9, canvas frame 09): the party's tokens stand on the site's
// map, in the same image cells a fight's tokens use, so a fight started here can stand everyone where they were.
// Pure helpers only; the screen and the writes live in `useExploreParty` and `SiteExploreView`.

import { cellKey, type CellKey } from "@/types/dungeonMap.types";
import type { ExploreParty } from "@/types/campaign.types";
import type { RunCombatant } from "@/types/encounter.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { PartyMember } from "@/types/party.types";
import { exploreRoute } from "@/lib/locations/placeRoute";
import { regionCellToBattleCell, seedTokenPositions } from "@/lib/battlemap/roomBridge";

export type ExploreCell = { x: number; y: number };

/** A room's standing in the Rooms list: lit, the one the party is stepping into, or still shaded. */
export type RoomExploreState = "explored" | "entering" | "hidden";

/** The instance id a character's token carries in a fight (`p-<member id>`), so exploring and fighting agree on who is who. */
export function partyTokenId(memberId: string): string {
  return `p-${memberId}`;
}

type TokenMember = Pick<PartyMember, "id" | "name" | "current_hp" | "max_hp" | "portrait_url" | "portrait_focal_point">;

/** A character as a token on the exploring map: a Medium player combatant. Nothing here fights, so the numbers are only what the token and the party column read. */
export function exploreToken(member: TokenMember, position: ExploreCell | null): RunCombatant {
  return {
    instance_id: partyTokenId(member.id),
    type: "player",
    name: member.name,
    faction_id: "players",
    initiative: null,
    hp: member.current_hp,
    max_hp: member.max_hp,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    party_member_id: member.id,
    portrait_url: member.portrait_url,
    portrait_focal_point: member.portrait_focal_point,
    size: "medium",
    footprint: 1,
    ...(position ? { position } : {}),
  };
}

/** Where the party stands on this site, or an empty record when `explore_party` is for another site (one site at a time). */
export function positionsOnSite(explore: ExploreParty | null, siteId: string): Record<string, ExploreCell> {
  return explore !== null && explore.site_id === siteId ? explore.positions : {};
}

/** battle cell -> the room whose traced region covers it. The first region to claim a cell keeps it. */
export function roomCellIndex(regions: readonly LocationMapRegion[], calibration: GridCalibration): Map<CellKey, string> {
  const index = new Map<CellKey, string>();
  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    for (const cell of region.cells) {
      const key = regionCellToBattleCell(cell, calibration);
      if (!index.has(key)) index.set(key, region.space_location_id);
    }
  }
  return index;
}

/** A room's cells in battle-cell space, by room id. */
export function roomBattleCells(regions: readonly LocationMapRegion[], calibration: GridCalibration): Map<string, CellKey[]> {
  const byRoom = new Map<string, CellKey[]>();
  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    const cells = region.cells.map((c) => regionCellToBattleCell(c, calibration));
    byRoom.set(region.space_location_id, [...(byRoom.get(region.space_location_id) ?? []), ...cells]);
  }
  return byRoom;
}

/** The room a token's middle stands in, or null in a corridor, outside, or on an untraced stretch. */
export function roomUnder(position: ExploreCell, footprint: number, index: ReadonlyMap<CellKey, string>): string | null {
  const mid = footprint / 2;
  return index.get(cellKey(Math.floor(position.x + mid), Math.floor(position.y + mid))) ?? null;
}

/**
 * The room the party is stepping into: the one the lead token stands in, when it is not the room the party is
 * already in. Null while the lead stays put in the current room, or is between rooms.
 */
export function roomBeingEntered(
  lead: { position: ExploreCell; footprint: number } | null,
  index: ReadonlyMap<CellKey, string>,
  currentRoomId: string | null,
): string | null {
  if (!lead) return null;
  const under = roomUnder(lead.position, lead.footprint, index);
  return under !== null && under !== currentRoomId ? under : null;
}

/**
 * First entry to a site: the party stands in the room it is in, else the first room, packed row by row like a fight
 * seats them. A character the room has no space for is left out (the caller's tray picks them up).
 */
export function seedPartyPositions(
  members: readonly TokenMember[],
  roomCells: ReadonlyMap<string, CellKey[]>,
  roomOrder: readonly string[],
  partyRoomId: string | null,
): Record<string, ExploreCell> {
  const entrance = partyRoomId !== null && roomCells.has(partyRoomId) ? partyRoomId : roomOrder.find((id) => roomCells.has(id));
  const cells = entrance === undefined ? undefined : roomCells.get(entrance);
  if (cells === undefined) return {};
  const seated = seedTokenPositions(members.map((m) => exploreToken(m, null)), cells);
  const positions: Record<string, ExploreCell> = {};
  for (const c of seated) {
    if (c.party_member_id !== undefined && c.position) positions[c.party_member_id] = c.position;
  }
  return positions;
}

/**
 * A fight starting on this site stands each character where they were exploring: those with no square yet take their
 * explored one, when it lies on the map. Anyone left without one is seated by the room, as before.
 */
export function seatFromExploring(
  combatants: readonly RunCombatant[],
  explore: ExploreParty | null,
  siteId: string,
  cellsAcross: number,
): RunCombatant[] {
  const walked = positionsOnSite(explore, siteId);
  return combatants.map((c) => {
    if (c.position || c.party_member_id === undefined) return c;
    const at = Object.hasOwn(walked, c.party_member_id) ? walked[c.party_member_id] : undefined;
    // Only the width of the picture is known here; below its bottom edge a token would still need the image height.
    return at !== undefined && at.x >= 0 && at.y >= 0 && at.x < cellsAcross ? { ...c, position: at } : c;
  });
}

/** The site (id and name) a fight's map belongs to, when it is anchored in one: the place a fight started from exploring goes back to. */
export type FightSite = { id: string; name: string };

/** Where leaving a fight lands: back in the site it was fought in, else the encounter's builder as always. */
export function afterFightRoute(encounterId: string, site: FightSite | null): string {
  return site ? exploreRoute(site.id) : `/encounters/${encounterId}`;
}

export interface CellEdge {
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

/** The perimeter of a set of cells, as edges in cell units: a side is drawn where the neighbour on that side is not in the set, so an L-shaped room outlines as an L. */
export function cellOutline(cells: readonly CellKey[]): CellEdge[] {
  const set = new Set<string>(cells);
  const edges: CellEdge[] = [];
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    if (!set.has(cellKey(x, y - 1))) edges.push({ x1: x, y1: y, x2: x + 1, y2: y });
    if (!set.has(cellKey(x, y + 1))) edges.push({ x1: x, y1: y + 1, x2: x + 1, y2: y + 1 });
    if (!set.has(cellKey(x - 1, y))) edges.push({ x1: x, y1: y, x2: x, y2: y + 1 });
    if (!set.has(cellKey(x + 1, y))) edges.push({ x1: x + 1, y1: y, x2: x + 1, y2: y + 1 });
  }
  return edges;
}

/** The middle of a set of cells, in cell units: where a room's name sits. Null for no cells. */
export function cellsCentre(cells: readonly CellKey[]): { x: number; y: number } | null {
  if (cells.length === 0) return null;
  let sx = 0;
  let sy = 0;
  for (const key of cells) {
    const [x, y] = key.split(",").map(Number);
    sx += x + 0.5;
    sy += y + 0.5;
  }
  return { x: sx / cells.length, y: sy / cells.length };
}
