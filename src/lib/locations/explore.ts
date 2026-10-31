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
import { sizeToFootprint } from "@/lib/battlemap/tokenFootprint";
import type { MonsterSize } from "@/types/monster.types";
import type { SpeciesSize } from "@/types/species.types";
import { effectiveSize, type SpeciesStatsSource } from "@/rules/speciesStats";

export type ExploreCell = { x: number; y: number };

/** A room's standing in the Rooms list: lit, the one the party is stepping into, or still shaded. */
export type RoomExploreState = "explored" | "entering" | "hidden";

/** The instance id a character's token carries in a fight (`p-<member id>`), so exploring and fighting agree on who is who. */
export function partyTokenId(memberId: string): string {
  return `p-${memberId}`;
}

type TokenMember = Pick<PartyMember, "id" | "name" | "current_hp" | "max_hp" | "portrait_url" | "portrait_focal_point">;

/** A character as a token on the exploring map. Nothing here fights, so the numbers are only what the token and the party column read. A character with no known size is Medium (app convention). */
export function exploreToken(member: TokenMember, position: ExploreCell | null, size: MonsterSize | null = null): RunCombatant {
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
    size: size ?? "medium",
    footprint: sizeToFootprint(size),
    ...(position ? { position } : {}),
  };
}

/** A character's size by the book: the species' (or the subrace's, which replaces it). Null while the species is unknown. */
export function memberSize(species: SpeciesStatsSource | undefined, subrace: string | null): SpeciesSize | null {
  return species ? effectiveSize(species, subrace) : null;
}

/** The party as tokens on a site: each character stands on their explored square, or has none yet and is left off the map. */
export function exploreTokens(
  members: readonly TokenMember[],
  explore: ExploreParty | null,
  siteId: string,
  sizeOf: (memberId: string) => MonsterSize | null = () => null,
): RunCombatant[] {
  const standing = positionsOnSite(explore, siteId);
  return members.map((m) => exploreToken(m, Object.hasOwn(standing, m.id) ? standing[m.id] : null, sizeOf(m.id)));
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

/** The picture's size in image cells: how many squares across and down the calibrated frame holds. */
export type ExploreFrame = { across: number; down: number };

/**
 * Packs these characters into a block of squares whose top-left is `topLeft`, row by row, sized by footprint so a
 * Large one gets its four squares. The block is a little roomier than the party needs, so nobody is left out.
 */
export function seatInFormation(
  members: readonly TokenMember[],
  topLeft: ExploreCell,
  sizeOf: (memberId: string) => MonsterSize | null = () => null,
): Record<string, ExploreCell> {
  if (members.length === 0) return {};
  const tokens = members.map((m) => exploreToken(m, null, sizeOf(m.id)));
  const feet = tokens.map((t) => t.footprint ?? 1);
  const area = feet.reduce((sum, f) => sum + Math.max(f, 1) ** 2, 0);
  const side = Math.ceil(Math.sqrt(area)) + Math.ceil(Math.max(...feet));
  const x0 = Math.floor(topLeft.x);
  const y0 = Math.floor(topLeft.y);
  const block: CellKey[] = [];
  for (let dy = 0; dy < side; dy++) for (let dx = 0; dx < side; dx++) block.push(cellKey(x0 + dx, y0 + dy));
  const positions: Record<string, ExploreCell> = {};
  for (const c of seedTokenPositions(tokens, block)) {
    if (c.party_member_id !== undefined && c.position) positions[c.party_member_id] = c.position;
  }
  return positions;
}

/**
 * First entry to a site with no room to seat them in (nothing traced, or the entrance has no squares on this frame):
 * the party stands in formation around the middle of the picture.
 */
export function seedPartyAtCentre(
  members: readonly TokenMember[],
  frame: ExploreFrame,
  sizeOf: (memberId: string) => MonsterSize | null = () => null,
): Record<string, ExploreCell> {
  const probe = seatInFormation(members, { x: 0, y: 0 }, sizeOf);
  const spanX = Math.max(0, ...Object.values(probe).map((p) => p.x + 1));
  const spanY = Math.max(0, ...Object.values(probe).map((p) => p.y + 1));
  const x = Math.max(0, Math.floor(frame.across / 2 - spanX / 2));
  const y = Math.max(0, Math.floor(frame.down / 2 - spanY / 2));
  return seatInFormation(members, { x, y }, sizeOf);
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
