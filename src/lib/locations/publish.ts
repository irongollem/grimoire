// ── Publish to Atlas: reconcile a derived structure (#868, epic #868) ──────
//
// "It is a diff, not an import" (frame 05, "Publish review"): every row in
// the returned plan says what it will do, matched against what the Atlas
// already holds by cell signature or edge key, never by blindly overwriting.
// The map is not the authority — the drawing proposes, the Atlas decides
// (frame 01) — so a region, door or placement a DM has touched by hand
// (`derived_from === "dm"`, or door fields a re-publish would clobber) is
// held back and offered rather than applied.
//
// This module only *plans*. It reads the current Atlas state and the fresh
// `DerivedStructure` and returns a `PublishPlan` the review modal renders
// and a later write step applies — no Supabase writes happen here, which is
// what keeps it pure and cheap to test.
//
// Two things are never deleted, per frame 01 and the "Nothing is deleted"
// caption: a bound region whose cells no longer match anything derived
// becomes `orphan` (never a delete — removing it stays a deliberate act in
// the Rooms panel), and a placement whose cell now falls outside every
// derived space becomes `lost-room` (stays room-level, cell key kept).

import type { CellKey, CellMetadata } from "@/types/dungeonMap.types";
import type { LocationType } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";
import type { DoorKind, LocationDoor, SourceEdgeKey } from "@/types/locationDoor.types";
import type { LocationPlacement, LocationPlacementKind } from "@/types/locationPlacement.types";
import { placementKind } from "@/types/locationPlacement.types";
import type {
  DerivedLink,
  DerivedSpace,
  DerivedStair,
  DerivedStructure,
  DerivedWay,
  DerivedZone,
} from "@/cartographer/structure.types";

export interface PublishInputs {
  siteId: string;
  derived: DerivedStructure;
  /** Direct children of the site that are bindable spaces (rooms and nested sites). */
  spaces: ReadonlyArray<{ id: string; name: string; location_type: LocationType }>;
  regions: readonly LocationMapRegion[]; // every region of the site
  doors: readonly LocationDoor[]; // every door whose endpoints are children of the site
  placements: readonly LocationPlacement[]; // every placement on any of the site's spaces
  /** Stairs the DM has already resolved in the review: cellKey → target space id (may be a nested site). */
  stairTargets?: Readonly<Record<CellKey, string>>;
}

export type SpaceChange =
  | { kind: "create"; space: DerivedSpace; proposedName: string } // new room + bound region
  | { kind: "update"; space: DerivedSpace; region: LocationMapRegion; before: number; after: number; reason: "shape" }
  | { kind: "held"; space: DerivedSpace; region: LocationMapRegion; reason: "dm-edited" } // derived_from === "dm" and cells differ → offered, not applied
  | { kind: "skip"; space: DerivedSpace; region: LocationMapRegion } // same signature
  | { kind: "orphan"; region: LocationMapRegion }; // bound region whose signature/overlap has no derived space any more

export type WayChange =
  | { kind: "create"; way: DerivedWay; fromSpaceId: string; toSpaceId: string } // ids resolved through SpaceChange results (a "create" space gets its id at apply time — see spaceIdFor helper below)
  | { kind: "held"; way: DerivedWay; door: LocationDoor; reason: "dm-edited" } // matched by edgeKey but the door has starts_locked/is_secret/lock_note/label set by the DM → keep mine
  | { kind: "update"; way: DerivedWay; door: LocationDoor; before: DoorKind; after: DoorKind } // matched by edgeKey, door carries NO DM authoring, but the drawing's door_kind changed (a closed door redrawn as an arch) → apply the new kind
  | { kind: "skip"; way: DerivedWay; door: LocationDoor }
  | { kind: "unresolved-stair"; stair: DerivedStair } // no target chosen yet
  | { kind: "create-stair"; stair: DerivedStair; fromSpaceId: string; toSpaceId: string };

export type SpaceRef = { kind: "existing"; spaceId: string } | { kind: "created"; spaceKey: string };

export type PlacementChange =
  | { kind: "create"; link: DerivedLink; target: { kind: LocationPlacementKind; id: string }; spaceRef: SpaceRef } // trap_id/feature_id links with no placement anywhere in the site carrying that entity+cell
  | { kind: "reanchor"; placement: LocationPlacement; spaceRef: SpaceRef } // placement.source_cell_key now lies in a different space
  | { kind: "keep"; placement: LocationPlacement } // still in its room
  | { kind: "lost-room"; placement: LocationPlacement } // its cell is in no space now; stays room-level, cell kept
  | { kind: "note"; link: DerivedLink; spaceRef: SpaceRef | null }; // encounter_id / note_id links: reported for the modal, not written (encounters and notes have their own location columns)

export interface ZoneChange {
  kind: "create" | "update" | "skip";
  zone: DerivedZone;
  region?: LocationMapRegion;
}

export interface PublishPlan {
  spaces: SpaceChange[];
  ways: WayChange[];
  placements: PlacementChange[];
  zones: ZoneChange[];
  summary: {
    newRooms: number;
    regionUpdates: number;
    newDoors: number;
    doorUpdates: number;
    heldSpaces: number;
    heldWays: number;
    orphans: number;
    reanchored: number;
  };
}

// ── Cell-key ordering ────────────────────────────────────────────────────
//
// Every array in the plan is ordered deterministically off the map's own
// coordinate space, the same numeric (y, then x) order `canonicalCells`
// uses — never insertion order, and never a lexical string sort, which would
// put "10,2" before "3,4". `key.split(":")[0]` peels the direction suffix
// off an edge key ("7,9:N") so one comparator serves cell keys and edge keys.

function cellXY(key: string): [number, number] {
  const [xs, ys] = key.split(":")[0]!.split(",");
  return [Number(xs), Number(ys)];
}

function compareByCell(a: string, b: string): number {
  const [ax, ay] = cellXY(a);
  const [bx, by] = cellXY(b);
  return ay - by || ax - bx || a.localeCompare(b);
}

// ── Space matching ──────────────────────────────────────────────────────

/**
 * Jaccard similarity of two cell sets. Both empty counts as identical (1) —
 * an empty set overlapping an empty set is not evidence of *no* relation,
 * it is simply not evidence either way, and treating it as a mismatch would
 * make an edge case behave like the strongest possible disagreement.
 */
export function jaccard(a: readonly CellKey[], b: readonly CellKey[]): number {
  const setA = new Set(a);
  const setB = new Set(b);
  if (setA.size === 0 && setB.size === 0) return 1;
  let intersection = 0;
  for (const key of setA) if (setB.has(key)) intersection++;
  const union = setA.size + setB.size - intersection;
  return union === 0 ? 1 : intersection / union;
}

/**
 * Match one derived space to an existing bound region: identical signature
 * first (a re-publish of the same cells); else best Jaccard overlap ≥ 0.5
 * among the candidates (the room moved or resized); else, as a last resort,
 * an exact name match between the annotation and the bound space's name
 * (the shape changed enough to lose overlap, but the DM's label survived).
 * Exported for the test and for the modal's "why did these match" tooltip.
 *
 * Filters `candidates` to bound space regions itself, so a caller can pass
 * a site's full region list without pre-filtering.
 */
export function matchSpace(
  space: DerivedSpace,
  candidates: readonly LocationMapRegion[],
  spaceNames: ReadonlyMap<string, string>,
): { region: LocationMapRegion; by: "signature" | "overlap" | "name" } | null {
  const pool = candidates.filter((r) => r.region_role === "space" && r.space_location_id !== null);

  const bySignature = pool.find((r) => r.cell_signature === space.signature);
  if (bySignature) return { region: bySignature, by: "signature" };

  let best: LocationMapRegion | null = null;
  let bestScore = 0;
  for (const region of pool) {
    const score = jaccard(space.cells, region.cells);
    if (score >= 0.5 && score > bestScore) {
      best = region;
      bestScore = score;
    }
  }
  if (best) return { region: best, by: "overlap" };

  if (space.name) {
    const byName = pool.find((r) => r.space_location_id !== null && spaceNames.get(r.space_location_id) === space.name);
    if (byName) return { region: byName, by: "name" };
  }

  return null;
}

/** `created:<spaceKey>` is a placeholder id for a room this plan proposes to
 *  create — the apply step fills in the real id once it exists. Ways and
 *  placements resolve their endpoints through this rather than an id, so
 *  the plan can be fully computed before anything is written. */
const CREATED_PREFIX = "created:";

export function isCreatedRef(id: string): boolean {
  return id.startsWith(CREATED_PREFIX);
}

export function createdRefKey(id: string): string {
  return id.slice(CREATED_PREFIX.length);
}

function createdRef(spaceKey: string): string {
  return `${CREATED_PREFIX}${spaceKey}`;
}

function refToSpaceRef(id: string): SpaceRef {
  return isCreatedRef(id) ? { kind: "created", spaceKey: createdRefKey(id) } : { kind: "existing", spaceId: id };
}

// ── Spaces ───────────────────────────────────────────────────────────────

function planSpaces(input: PublishInputs): { changes: SpaceChange[]; spaceIdFor: Map<string, string> } {
  const spaceNames = new Map(input.spaces.map((s) => [s.id, s.name]));
  const candidates = input.regions.filter((r) => r.region_role === "space" && r.space_location_id !== null);
  const unmatched = [...candidates];

  const sortedSpaces = [...input.derived.spaces].sort((a, b) => compareByCell(a.cells[0] ?? "0,0", b.cells[0] ?? "0,0"));

  const changes: SpaceChange[] = [];
  const spaceIdFor = new Map<string, string>();
  let createIndex = 0;

  for (const space of sortedSpaces) {
    const match = matchSpace(space, unmatched, spaceNames);
    if (!match) {
      createIndex++;
      changes.push({ kind: "create", space, proposedName: space.name ?? `Region ${createIndex}` });
      spaceIdFor.set(space.key, createdRef(space.key));
      continue;
    }

    const idx = unmatched.indexOf(match.region);
    if (idx !== -1) unmatched.splice(idx, 1);
    spaceIdFor.set(space.key, match.region.space_location_id!);

    if (match.by === "signature") {
      changes.push({ kind: "skip", space, region: match.region });
      continue;
    }

    if (match.region.derived_from === "dm") {
      changes.push({ kind: "held", space, region: match.region, reason: "dm-edited" });
    } else {
      changes.push({
        kind: "update",
        space,
        region: match.region,
        before: match.region.cells.length,
        after: space.cells.length,
        reason: "shape",
      });
    }
  }

  const orphans = [...unmatched].sort((a, b) => compareByCell(a.cells[0] ?? "0,0", b.cells[0] ?? "0,0"));
  for (const region of orphans) changes.push({ kind: "orphan", region });

  return { changes, spaceIdFor };
}

// ── Ways (doors, arches, stairs) ─────────────────────────────────────────

function planWays(input: PublishInputs, spaceIdFor: Map<string, string>): WayChange[] {
  const doorsByEdge = new Map<SourceEdgeKey, LocationDoor>();
  for (const door of input.doors) {
    if (door.source_edge_key !== null) doorsByEdge.set(door.source_edge_key, door);
  }

  const spaceRefId = (spaceKey: string): string => spaceIdFor.get(spaceKey) ?? createdRef(spaceKey);

  const changes: WayChange[] = [];

  const sortedWays = [...input.derived.ways].sort((a, b) => compareByCell(a.edgeKey, b.edgeKey));
  for (const way of sortedWays) {
    const door = doorsByEdge.get(way.edgeKey);
    if (!door) {
      changes.push({ kind: "create", way, fromSpaceId: spaceRefId(way.fromKey), toSpaceId: spaceRefId(way.toKey) });
      continue;
    }
    // `location_doors` carries no provenance column, so a `door_kind`
    // mismatch alone can't tell "the DM set it to stair by hand" from "the
    // drawing changed a closed door to an arch" — the same ambiguity a
    // region's `derived_from` resolves for spaces. The proxy here is whether
    // the door carries any OTHER field only a DM would set: with none of
    // those, the door is still the drawing's to update; with any of them, a
    // re-publish must not clobber the DM's decisions, kind included.
    const dmAuthored =
      door.starts_locked ||
      door.is_secret ||
      door.lock_note !== null ||
      door.label !== "";
    if (dmAuthored) {
      changes.push({ kind: "held", way, door, reason: "dm-edited" });
    } else if (door.door_kind !== way.kind) {
      changes.push({ kind: "update", way, door, before: door.door_kind, after: way.kind });
    } else {
      changes.push({ kind: "skip", way, door });
    }
  }

  const sortedStairs = [...input.derived.stairs].sort((a, b) => compareByCell(a.cellKey, b.cellKey));
  for (const stair of sortedStairs) {
    // A stair on a cell no space claims is never guessed at — always unresolved.
    if (stair.spaceKey === null) {
      changes.push({ kind: "unresolved-stair", stair });
      continue;
    }
    const target = input.stairTargets?.[stair.cellKey];
    if (!target) {
      changes.push({ kind: "unresolved-stair", stair });
      continue;
    }
    changes.push({ kind: "create-stair", stair, fromSpaceId: spaceRefId(stair.spaceKey), toSpaceId: target });
  }

  return changes;
}

// ── Placements (traps, features — and the notes that ride along) ────────

function entityIdOf(placement: LocationPlacement): string | null {
  return placement.trap_id ?? placement.dungeon_feature_id ?? null;
}

function placementChangeCellKey(change: PlacementChange): CellKey | null {
  switch (change.kind) {
    case "create":
    case "note":
      return change.link.cellKey;
    case "reanchor":
    case "keep":
    case "lost-room":
      return change.placement.source_cell_key;
  }
}

function planPlacements(input: PublishInputs, spaceIdFor: Map<string, string>): PlacementChange[] {
  const cellToSpaceKey = new Map<CellKey, string>();
  for (const space of input.derived.spaces) {
    for (const cell of space.cells) cellToSpaceKey.set(cell, space.key);
  }

  // A trap/feature link with no space at all still has to land somewhere a
  // placement can point at, so it falls back to the site itself — unlike a
  // "note" link, whose spaceRef stays null because nothing gets written for
  // it (encounters and notes carry their own location column).
  const resolveSpaceRef = (spaceKey: string | null): SpaceRef => {
    if (spaceKey === null) return { kind: "existing", spaceId: input.siteId };
    return refToSpaceRef(spaceIdFor.get(spaceKey) ?? createdRef(spaceKey));
  };

  const changes: PlacementChange[] = [];

  // Existing placements: keep in place, reanchor to the room that now holds
  // their cell, or — if that cell belongs to no room any more — lost-room.
  for (const placement of input.placements) {
    const kind = placementKind(placement);
    if (kind !== "trap" && kind !== "dungeon_feature") {
      // Roll tables and loot tables never rode a cell — CellMetadata has no
      // field for either — so a re-publish never touches them.
      changes.push({ kind: "keep", placement });
      continue;
    }

    if (placement.source_cell_key !== null) {
      const spaceKey = cellToSpaceKey.get(placement.source_cell_key) ?? null;
      if (spaceKey === null) {
        changes.push({ kind: "lost-room", placement });
        continue;
      }
      const spaceRef = resolveSpaceRef(spaceKey);
      const resolvedId = spaceRef.kind === "existing" ? spaceRef.spaceId : createdRef(spaceRef.spaceKey);
      if (resolvedId === placement.location_id) {
        changes.push({ kind: "keep", placement });
      } else {
        changes.push({ kind: "reanchor", placement, spaceRef });
      }
      continue;
    }

    // No cell key yet (added from the room sheet, or a stale room-level
    // entry). If a link on the map now names this same entity inside this
    // placement's own room, the write path can finally give it a cell —
    // that's a reanchor (of the cell, not the room), never a plain keep.
    const entityId = entityIdOf(placement)!;
    const matchingLink = input.derived.links.find((link) => {
      if (link.metadata.trap_id !== entityId && link.metadata.feature_id !== entityId) return false;
      const spaceRef = resolveSpaceRef(link.spaceKey);
      return spaceRef.kind === "existing" && spaceRef.spaceId === placement.location_id;
    });
    if (matchingLink) {
      changes.push({ kind: "reanchor", placement, spaceRef: { kind: "existing", spaceId: placement.location_id } });
    } else {
      changes.push({ kind: "keep", placement });
    }
  }

  // Trap/feature links with no placement anywhere in the site carrying that
  // entity + cell (by the same matching rule, run in reverse) → create.
  const fields: ReadonlyArray<[LocationPlacementKind, (m: CellMetadata) => string | undefined]> = [
    ["trap", (m) => m.trap_id],
    ["dungeon_feature", (m) => m.feature_id],
  ];
  for (const link of input.derived.links) {
    for (const [targetKind, read] of fields) {
      const entityId = read(link.metadata);
      if (!entityId) continue;
      const matched = input.placements.some((p) => {
        if (entityIdOf(p) !== entityId) return false;
        if (p.source_cell_key === link.cellKey) return true;
        if (p.source_cell_key === null) {
          const spaceRef = resolveSpaceRef(link.spaceKey);
          return spaceRef.kind === "existing" && spaceRef.spaceId === p.location_id;
        }
        return false;
      });
      if (!matched) {
        changes.push({ kind: "create", link, target: { kind: targetKind, id: entityId }, spaceRef: resolveSpaceRef(link.spaceKey) });
      }
    }
  }

  // Encounter/note links never write a placement — reported for the modal only.
  for (const link of input.derived.links) {
    if (link.metadata.encounter_id || link.metadata.note_id) {
      changes.push({ kind: "note", link, spaceRef: link.spaceKey === null ? null : resolveSpaceRef(link.spaceKey) });
    }
  }

  changes.sort((a, b) => {
    const ak = placementChangeCellKey(a);
    const bk = placementChangeCellKey(b);
    if (ak === null && bk === null) return 0;
    if (ak === null) return 1;
    if (bk === null) return -1;
    return compareByCell(ak, bk);
  });

  return changes;
}

// ── Zones ────────────────────────────────────────────────────────────────

function planZones(input: PublishInputs): ZoneChange[] {
  const unmatched = input.regions.filter((r) => r.region_role === "zone");
  const changes: ZoneChange[] = [];

  const sortedZones = [...input.derived.zones].sort((a, b) => compareByCell(a.cells[0] ?? "0,0", b.cells[0] ?? "0,0"));
  const pool = [...unmatched];

  for (const zone of sortedZones) {
    let idx = pool.findIndex((r) => r.cell_signature === zone.signature);
    const matchedBySignature = idx !== -1;
    if (idx === -1) {
      idx = pool.findIndex((r) => r.zone_kind === zone.kind && r.label === zone.label);
    }
    if (idx === -1) {
      changes.push({ kind: "create", zone });
      continue;
    }
    const region = pool[idx]!;
    pool.splice(idx, 1);
    changes.push({ kind: matchedBySignature ? "skip" : "update", zone, region });
  }

  return changes;
}

// ── Entry point ──────────────────────────────────────────────────────────

export function planPublish(input: PublishInputs): PublishPlan {
  const { changes: spaces, spaceIdFor } = planSpaces(input);
  const ways = planWays(input, spaceIdFor);
  const placements = planPlacements(input, spaceIdFor);
  const zones = planZones(input);

  return {
    spaces,
    ways,
    placements,
    zones,
    summary: {
      newRooms: spaces.filter((c) => c.kind === "create").length,
      regionUpdates: spaces.filter((c) => c.kind === "update").length,
      newDoors: ways.filter((c) => c.kind === "create").length,
      doorUpdates: ways.filter((c) => c.kind === "update").length,
      heldSpaces: spaces.filter((c) => c.kind === "held").length,
      heldWays: ways.filter((c) => c.kind === "held").length,
      orphans: spaces.filter((c) => c.kind === "orphan").length,
      reanchored: placements.filter((c) => c.kind === "reanchor").length,
    },
  };
}
