// Seating the party on a site's map, in the image cells a fight's tokens use. Pure, and written to run on the server
// too: the AI table's Narrator moves the party (#1021 row 9), and with no DM browser open the server must stand the
// party in the room it entered the way the exploring screen does. That is why this is not in `explore.ts`: that file
// reaches the Cartographer's keymap, the sight grids and the species rules, none of which the edge runtime loads, and
// every import here is relative with its `.ts`.

import { cellKey, type CellKey } from "../../types/dungeonMap.types.ts";
import type { ExploreParty } from "../../types/exploreParty.types.ts";
import type { RunCombatant } from "../../types/encounter.types.ts";
import type { GridCalibration } from "../../types/location.types.ts";
import type { LocationMapRegion } from "../../types/locationMapRegion.types.ts";
import type { MonsterSize } from "../../types/monster.types.ts";
import { regionCellToBattleCell, seedTokenPositions } from "../battlemap/roomBridge.ts";
import { sizeToFootprint } from "../battlemap/tokenFootprint.ts";
import { positionsOnSite, type ExploreCell } from "../../rules/explore/explorePositions.ts";

/** The instance id a character's token carries in a fight (`p-<member id>`), so exploring and fighting agree on who is who. */
export function partyTokenId(memberId: string): string {
  return `p-${memberId}`;
}

/** Who is seated: only the id matters, so the server needs no sheet to do it. */
export type SeatedMember = { id: string };

/** A region as seating reads it: only a room's squares. */
export type RoomRegion = Pick<LocationMapRegion, "region_role" | "space_location_id" | "cells">;

/** A stand-in for a character while seating: seating reads the kind, the id, the footprint and the square, never the numbers. */
function seatingToken(memberId: string, size: MonsterSize | null): RunCombatant {
  return {
    instance_id: partyTokenId(memberId),
    type: "player",
    name: "",
    faction_id: "players",
    initiative: null,
    hp: 0,
    max_hp: 0,
    ac: "10",
    conditions: [],
    curses: [],
    death_saves: { successes: 0, failures: 0 },
    dex_mod: 0,
    party_member_id: memberId,
    size: size ?? "medium",
    footprint: sizeToFootprint(size),
  };
}

function positionsOf(seated: readonly RunCombatant[]): Record<string, ExploreCell> {
  const positions: Record<string, ExploreCell> = {};
  for (const c of seated) {
    if (c.party_member_id !== undefined && c.position) positions[c.party_member_id] = c.position;
  }
  return positions;
}

/** A room's cells in battle-cell space, by room id. */
export function roomBattleCells(regions: readonly RoomRegion[], calibration: GridCalibration): Map<string, CellKey[]> {
  const byRoom = new Map<string, CellKey[]>();
  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    const cells = region.cells.map((c) => regionCellToBattleCell(c, calibration));
    byRoom.set(region.space_location_id, [...(byRoom.get(region.space_location_id) ?? []), ...cells]);
  }
  return byRoom;
}

/** The squares of the site's Entrance zones in battle cells, de-duplicated: where the party walks in (#1125). A zone
 *  marked as a way out only (`party_arrives: false`) is left out: creatures leave by it, nobody arrives. Empty when
 *  the site has none. */
export function entranceBattleCells(
  regions: readonly Pick<LocationMapRegion, "region_role" | "zone_kind" | "zone_payload" | "cells">[],
  calibration: GridCalibration,
): CellKey[] {
  const cells = new Set<CellKey>();
  for (const region of regions) {
    if (region.region_role !== "zone" || region.zone_kind !== "entrance") continue;
    if (region.zone_payload.party_arrives === false) continue;
    for (const cell of region.cells) cells.add(regionCellToBattleCell(cell, calibration));
  }
  return [...cells];
}

/**
 * First entry to a site that has an Entrance zone: the party walks in there, packed row by row and sized by footprint
 * like a fight seats them. A character the zone has no room for is left out, so the caller can seat them elsewhere.
 */
export function seedPartyAtEntrance(
  members: readonly SeatedMember[],
  entranceCells: readonly CellKey[],
  sizeOf: (memberId: string) => MonsterSize | null = () => null,
): Record<string, ExploreCell> {
  return positionsOf(seedTokenPositions(members.map((m) => seatingToken(m.id, sizeOf(m.id))), [...entranceCells]));
}

/**
 * First entry to a site: the party stands in the room it is in, else the first room, packed row by row like a fight
 * seats them. A character the room has no space for is left out (the caller's tray picks them up).
 */
export function seedPartyPositions(
  members: readonly SeatedMember[],
  roomCells: ReadonlyMap<string, CellKey[]>,
  roomOrder: readonly string[],
  partyRoomId: string | null,
): Record<string, ExploreCell> {
  const entrance = partyRoomId !== null && roomCells.has(partyRoomId) ? partyRoomId : roomOrder.find((id) => roomCells.has(id));
  const cells = entrance === undefined ? undefined : roomCells.get(entrance);
  if (cells === undefined) return {};
  return positionsOf(seedTokenPositions(members.map((m) => seatingToken(m.id, null)), cells));
}

/**
 * What the party's arrival in a room does to the map it is on, as the exploring screen does it when the DM moves the
 * party into a room: the room's traced squares are seen, and the party stands in the room.
 *
 * APP CONVENTION: the server has no sight, so a room the story entered is revealed whole. The page's own sight still
 * adds what a character sees beyond it. A room with no traced square reveals and seats nothing.
 *
 * Seating: `explore_party` holds one site at a time, so a party standing on another map is seated afresh. A party
 * already on this map keeps the squares that lie inside the room (one the DM dragged into place stays put), and the
 * members whose square is elsewhere, or who have none, are seated in the room on the squares the others left free: the
 * story moved them, and a token left behind in the room they came from would show the party where it is not. (The
 * exploring screen's own "go to this room" seats everyone, the same way.) `party` is null when there is nothing to
 * write, so the stored one stays exactly as it was.
 */
export function partyArrival(input: {
  regions: readonly RoomRegion[];
  calibration: GridCalibration;
  roomId: string;
  siteId: string;
  memberIds: readonly string[];
  explore: ExploreParty | null;
}): { reveal: CellKey[]; party: ExploreParty | null } {
  const { regions, calibration, roomId, siteId, memberIds, explore } = input;
  const roomCells = roomBattleCells(regions, calibration);
  const cells = roomCells.get(roomId);
  if (cells === undefined) return { reveal: [], party: null };
  const standing = positionsOnSite(explore, siteId);
  const inRoom = new Set(cells);
  const kept: Record<string, ExploreCell> = {};
  for (const id of memberIds) {
    const at = Object.hasOwn(standing, id) ? standing[id] : undefined;
    if (at !== undefined && inRoom.has(cellKey(Math.floor(at.x), Math.floor(at.y)))) kept[id] = at;
  }
  const taken = new Set(Object.values(kept).map((at) => cellKey(Math.floor(at.x), Math.floor(at.y))));
  const free = new Map([[roomId, cells.filter((c) => !taken.has(c))]]);
  const moving = memberIds.filter((id) => !Object.hasOwn(kept, id)).map((id) => ({ id }));
  const seated = seedPartyPositions(moving, free, [roomId], roomId);
  if (Object.keys(seated).length === 0) return { reveal: [...new Set(cells)], party: null };
  // Members the story left out of this call (not at the table) keep whatever square they had on this map.
  return { reveal: [...new Set(cells)], party: { site_id: siteId, positions: { ...standing, ...seated } } };
}

