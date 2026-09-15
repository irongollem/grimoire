// ── Pure derivations for a site's door graph (#868, epic #780) ──────────────
//
// "Ways out" used to be read one room at a time — `useLocationDoors.ts`'s
// `doorsFromRoomPerspective`, mirrored on `LocationDoors.vue`. #868 lifts the
// same list to the site: a DM wants to see all eight of a dungeon's doors at
// a glance, not walk into each room in turn to find them. This module holds
// every pure derivation both scales read from, so the room panel and the
// site panel agree on what a door *is* by construction rather than by two
// implementations happening to match.

import { DOOR_KIND_LABELS, VERTICAL_DOOR_KINDS } from "@/types/locationDoor.types";
import type { DoorKind, SourceEdgeKey } from "@/types/locationDoor.types";
import { IconArch, IconDoor, IconPortal, IconShaft, IconStairs } from "@/lib/icons";
import type { AppIcon } from "@/lib/icons";
import { canonicaliseEdge } from "@/cartographer/edges";
import { detectHoveredEdge } from "@/cartographer/edgeHover";
import { cellAtImageFraction, cellRectInImageFractions } from "@/lib/locations/gridCalibration";
import { cellKey, parseCellKey, type CellKey } from "@/types/dungeonMap.types";
import type { GridCalibration } from "@/types/location.types";
import type { LocationMapRegion } from "@/types/locationMapRegion.types";

/**
 * One glyph per `DOOR_KIND` (#868), shared by the room-level panel
 * (`LocationDoors.vue`) and the site-wide one (`SiteWaysOutPanel.vue`) so a
 * stair reads as a stair wherever it's listed. Lucide ships no
 * stair/shaft/portal icon — see the comment on each export in `lib/icons.ts`
 * for what each one borrows.
 */
export const DOOR_KIND_ICONS: Record<DoorKind, AppIcon> = {
  door: IconDoor,
  arch: IconArch,
  stair: IconStairs,
  shaft: IconShaft,
  portal: IconPortal,
};

// ── Perspective merge ─────────────────────────────────────────────────────────
//
// Moved here from `useLocationDoors.ts` (#868) — a site-level reader needs
// the same merge a room-level one does, so there is exactly one
// implementation. Typed structurally against the fields it actually reads,
// same convention as `DoorEdge` in `siteRun.ts`, so a room-scoped fetch
// (`useLocationDoors`) and a site-scoped one (`useSiteDoors`) can each hand
// it their own row shape without a cast.

export interface DoorPerspectiveRow {
  from_location_id: string;
  /** Null: this door leads to untraced space (#884) — a one-sided door drawn
   *  on an edge with a region on only one side. */
  to_location_id: string | null;
  is_one_way: boolean;
  sort_order: number | null;
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
}

/** One door, as seen from a specific space: which space is at the other end,
 *  regardless of whether *this* space is the door's `from` or `to` side.
 *  `otherRoomId` is null exactly when this is a one-sided door (#884) viewed
 *  from its only traced side — there is no other room to link to yet. */
export interface RoomDoorView<T extends DoorPerspectiveRow = DoorPerspectiveRow> {
  door: T;
  otherRoomId: string | null;
  otherRoomName: string;
}

function compareDoorViews<T extends DoorPerspectiveRow>(a: RoomDoorView<T>, b: RoomDoorView<T>): number {
  if (a.door.sort_order !== b.door.sort_order) {
    if (a.door.sort_order === null) return 1;
    if (b.door.sort_order === null) return -1;
    return a.door.sort_order - b.door.sort_order;
  }
  return a.otherRoomName.localeCompare(b.otherRoomName);
}

/**
 * Merges a space's outgoing doors with its bidirectional incoming doors into
 * one "ways out" list, told from that space's point of view. A one-way door
 * leading INTO the space is dropped from its list — it is not a way out of
 * it.
 */
export function doorsFromRoomPerspective<T extends DoorPerspectiveRow>(
  rows: readonly T[],
  roomId: string,
): RoomDoorView<T>[] {
  const views: RoomDoorView<T>[] = [];
  for (const door of rows) {
    if (door.from_location_id === roomId) {
      // Null here (#884) means this door leads to untraced space — a real
      // state, not a lookup miss, so it gets its own label rather than the
      // "???" fallback below (that one covers `to_location_id` set but the
      // joined row missing, which is a data problem, not a plan state).
      const otherRoomName = door.to_location_id === null ? ONE_SIDED_DOOR_LABEL : (door.to_location?.name ?? "???");
      views.push({ door, otherRoomId: door.to_location_id, otherRoomName });
    } else if (door.to_location_id === roomId && !door.is_one_way) {
      views.push({ door, otherRoomId: door.from_location_id, otherRoomName: door.from_location?.name ?? "???" });
    }
  }
  return views.sort(compareDoorViews);
}

/**
 * Same merge, named for a site-wide reader (#868): a "space" here is any
 * bindable endpoint — a room or a nested site — not only a room.
 * `doorsFromRoomPerspective` stays the name the room-scoped composable keeps
 * using so its existing callers read unchanged; this is the name a
 * site-level caller reaches for so its own code doesn't say "room" about
 * something that might be a nested dungeon level. One implementation either
 * way.
 */
export function doorsOfSpace<T extends DoorPerspectiveRow>(
  rows: readonly T[],
  spaceId: string,
): RoomDoorView<T>[] {
  return doorsFromRoomPerspective(rows, spaceId);
}

// ── Vertical ways out (#868) ──────────────────────────────────────────────────

export interface DoorKindRow {
  door_kind: DoorKind;
}

/** The subset of doors that join two levels rather than two rooms on one
 *  floor — `VERTICAL_DOOR_KINDS`, the frame-06 "Vertical ways out" filter. */
export function verticalWays<T extends DoorKindRow>(doors: readonly T[]): T[] {
  return doors.filter((d) => VERTICAL_DOOR_KINDS.has(d.door_kind));
}

// ── Presentation ──────────────────────────────────────────────────────────────

export interface DoorTitleRow {
  from_location_id: string;
  /** Null: this door leads to untraced space (#884) — see `ONE_SIDED_DOOR_LABEL`. */
  to_location_id: string | null;
  door_kind: DoorKind;
}

/**
 * "Nave → Abbot's Cell", or "Drowned Stair ↓ Sunken Vault" for a vertical
 * kind — the arrow is the only thing the kind decides here. `names` looks up
 * a space's display name by id; a miss falls back to "???", the same marker
 * `doorsFromRoomPerspective` uses for a missing join. A one-sided door
 * (`to_location_id === null`, #884) gets `ONE_SIDED_DOOR_LABEL` instead —
 * that side isn't a lookup that came up empty, it's a known, nameable state.
 */
export function doorTitle(door: DoorTitleRow, names: ReadonlyMap<string, string>): string {
  const arrow = VERTICAL_DOOR_KINDS.has(door.door_kind) ? "↓" : "→";
  const from = names.get(door.from_location_id) ?? "???";
  const to = door.to_location_id === null ? ONE_SIDED_DOOR_LABEL : (names.get(door.to_location_id) ?? "???");
  return `${from} ${arrow} ${to}`;
}

export interface DoorSubtitleRow {
  door_kind: DoorKind;
  is_secret: boolean;
  starts_locked: boolean;
  lock_note: string | null;
  label: string;
  is_one_way: boolean;
}

/**
 * "Secret · behind the ash-screen" / "Locked · the brass key" / "Stair ·
 * two-way · flooded at the base" / "Shaft · one-way · 40 ft, no climb"
 * (#868, frame 06) — whichever fact about the door matters most to a DM
 * scanning the list, then the free-text detail that goes with it. Priority
 * is secret, then locked, then kind, matching the order the frame's own
 * examples read in: a door that is both secret and locked still leads with
 * "Secret" because that is the fact that gates whether the party can even
 * see the lock note yet.
 *
 * A vertical kind (stair, shaft) additionally names whether it can be
 * climbed both ways — a horizontal door already says this by which side of
 * it a room sits on, but a level change has no "other side" to read that
 * from, so `is_one_way` has to be spelled out.
 */
export function doorSubtitle(door: DoorSubtitleRow): string {
  if (door.is_secret) return door.label ? `Secret · ${door.label}` : "Secret";
  if (door.starts_locked) return door.lock_note ? `Locked · ${door.lock_note}` : "Locked";
  const parts = [DOOR_KIND_LABELS[door.door_kind]];
  if (VERTICAL_DOOR_KINDS.has(door.door_kind)) parts.push(door.is_one_way ? "one-way" : "two-way");
  if (door.label) parts.push(door.label);
  return parts.join(" · ");
}

/** The phrase `SiteWaysOutPanel`/`LocationDoors` show in place of a room name
 *  for a one-sided door's far end (#884) — never "???", the marker this
 *  codebase reserves for a genuinely unknown lookup miss. A one-sided door's
 *  far side isn't unknown; it's a known, nameable state — there is no room
 *  there yet — so it gets its own sentence. */
export const ONE_SIDED_DOOR_LABEL = "leads nowhere yet";

// ── Endpoints are derived from the plan, not picked (#884) ──────────────────
//
// A door's `edge_key` is where it sits on the site's grid; its endpoints are
// whatever traced, bound regions sit either side of that edge *right now* —
// never authored directly. `resolveEdgeEndpoints` is the one place that
// answers "what does this edge currently imply", shared by the door tool
// (placing or moving a door: `MapRegionsLayer.vue`) and by re-derivation
// (a region changed shape, so every door on its edges needs to catch up:
// `useLocationMapRegions.ts`).

/** cell → the *bound* space region sitting on it — an unbound or zone-role
 *  region claims no cell for this purpose, since there is no location id to
 *  hand back. Built once per resolution pass and handed to
 *  `resolveEdgeEndpoints`, rather than that function re-scanning every
 *  region per door. */
export function indexSpacesByCell(regions: readonly LocationMapRegion[]): Map<CellKey, string> {
  const index = new Map<CellKey, string>();
  for (const region of regions) {
    if (region.region_role !== "space" || !region.space_location_id) continue;
    for (const cell of region.cells) index.set(cell, region.space_location_id);
  }
  return index;
}

function parseEdgeKey(key: SourceEdgeKey): { x: number; y: number; side: "N" | "W" } {
  const [coords, side] = key.split(":") as [string, "N" | "W"];
  const [x, y] = coords.split(",").map(Number) as [number, number];
  return { x, y, side };
}

export interface EdgeEndpoints {
  fromLocationId: string;
  /** Null: the far side is untraced — a way out to untraced space. */
  toLocationId: string | null;
}

/**
 * What one plan edge currently implies about a door sitting on it. Four
 * cases, the same four `resolveDoorEndpoints`' tests cover:
 *
 * - Both sides traced → the edge's *owner* cell (`canonicaliseEdge`'s NW
 *   convention — the same cell `deriveWays` in `cartographer/structure.ts`
 *   calls `fromKey`) is `from`, the neighbour is `to`. Deterministic and
 *   stable across a re-derivation, so an existing door's direction (which
 *   matters for `is_one_way`) never flips just because both sides happen to
 *   already be traced.
 * - One side traced → that side becomes `from` regardless of which cell owns
 *   the edge, `to` is null. This is the one place ownership does NOT decide
 *   `from`: the traced side is the only one that can be a `from_location_id`
 *   at all, an untraced cell has no location to be one.
 * - Neither side traced → null. There is nothing to place a door against yet.
 * - Both sides traced but land in the SAME region → null. The edge doesn't
 *   actually separate two spaces (a line drawn across the middle of one
 *   traced room, say), so it is not a way out and callers must not touch an
 *   existing door's endpoints on the strength of it — see
 *   `resolveDoorEndpoints`, which reads this null as "leave it alone".
 */
export function resolveEdgeEndpoints(edgeKey: SourceEdgeKey, cellToSpace: ReadonlyMap<CellKey, string>): EdgeEndpoints | null {
  const { x, y, side } = parseEdgeKey(edgeKey);
  const ownerCell = cellKey(x, y);
  const neighborCell = side === "N" ? cellKey(x, y - 1) : cellKey(x - 1, y);

  const ownerSpace = cellToSpace.get(ownerCell) ?? null;
  const neighborSpace = cellToSpace.get(neighborCell) ?? null;

  if (ownerSpace && neighborSpace) {
    if (ownerSpace === neighborSpace) return null; // not a way out — internal to one room
    return { fromLocationId: ownerSpace, toLocationId: neighborSpace };
  }
  if (ownerSpace) return { fromLocationId: ownerSpace, toLocationId: null };
  if (neighborSpace) return { fromLocationId: neighborSpace, toLocationId: null };
  return null; // neither side traced
}

export interface DoorEndpointResolution {
  doorId: string;
  /** Whatever `resolveEdgeEndpoints` returned for this door's edge — null
   *  means "cannot resolve; do not touch this door's endpoints". */
  endpoints: EdgeEndpoints | null;
}

/**
 * Batches `resolveEdgeEndpoints` over every placed door (one with an
 * `edge_key`) against one `cellToSpace` index — the shape both the door tool
 * and site-wide re-derivation need, so neither has to rebuild the index
 * itself. A door with no `edge_key` (never placed) is skipped: there is no
 * edge to resolve anything from.
 */
export function resolveDoorEndpoints(
  doors: readonly { id: string; edge_key: SourceEdgeKey | null }[],
  regions: readonly LocationMapRegion[],
): DoorEndpointResolution[] {
  const cellToSpace = indexSpacesByCell(regions);
  const results: DoorEndpointResolution[] = [];
  for (const door of doors) {
    if (door.edge_key === null) continue;
    results.push({ doorId: door.id, endpoints: resolveEdgeEndpoints(door.edge_key, cellToSpace) });
  }
  return results;
}

// ── The door tool's own edge targeting (#884) ────────────────────────────────
//
// "Forced on the edge of a room" — hovering the plan snaps to the nearest
// cell edge, the same outer-25%-of-a-cell band the Cartographer's own wall
// and door tools use (`useMapCanvasEditor.ts`'s `EDGE_HOVER_THRESHOLD`,
// `detectHoveredEdge` in `cartographer/edgeHover.ts`) — reused rather than
// reinvented so the two editors agree on how close is close enough.

/** Fraction of a cell's own size within which a point snaps to that cell's
 *  nearest edge, mirroring the Cartographer's own tools. */
export const DOOR_EDGE_SNAP_THRESHOLD = 0.25;

/**
 * The plan edge a pointer at image-fraction `(fx, fy)` is close enough to
 * target, or null when it's past the snap threshold (nearer the cell's
 * middle than any edge). Canonicalised to NW ownership, so the result is
 * directly usable as `LocationDoor.edge_key`.
 */
export function edgeAtImageFraction(
  fx: number,
  fy: number,
  calibration: GridCalibration,
  imageNaturalWidth: number,
  imageNaturalHeight: number,
  threshold = DOOR_EDGE_SNAP_THRESHOLD,
): SourceEdgeKey | null {
  const cell = cellAtImageFraction(fx, fy, calibration, imageNaturalWidth, imageNaturalHeight);
  const rect = cellRectInImageFractions(cell, calibration, imageNaturalWidth, imageNaturalHeight);
  if (rect.w <= 0 || rect.h <= 0) return null;

  const dxFrac = (fx - rect.x) / rect.w;
  const dyFrac = (fy - rect.y) / rect.h;
  const hovered = detectHoveredEdge(dxFrac, dyFrac, 1, threshold);
  if (!hovered) return null;

  const [x, y] = parseCellKey(cell);
  const canonical = canonicaliseEdge(x, y, hovered.side);
  return `${canonical.x},${canonical.y}:${canonical.side}` as SourceEdgeKey;
}
