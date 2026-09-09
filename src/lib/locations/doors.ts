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
import type { DoorKind } from "@/types/locationDoor.types";
import { IconArch, IconDoor, IconPortal, IconShaft, IconStairs } from "@/lib/icons";
import type { AppIcon } from "@/lib/icons";

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
  to_location_id: string;
  is_one_way: boolean;
  sort_order: number | null;
  from_location: { id: string; name: string } | null;
  to_location: { id: string; name: string } | null;
}

/** One door, as seen from a specific space: which space is at the other end,
 *  regardless of whether *this* space is the door's `from` or `to` side. */
export interface RoomDoorView<T extends DoorPerspectiveRow = DoorPerspectiveRow> {
  door: T;
  otherRoomId: string;
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
      views.push({ door, otherRoomId: door.to_location_id, otherRoomName: door.to_location?.name ?? "???" });
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
  to_location_id: string;
  door_kind: DoorKind;
}

/**
 * "Nave → Abbot's Cell", or "Drowned Stair ↓ Sunken Vault" for a vertical
 * kind — the arrow is the only thing the kind decides here. `names` looks up
 * a space's display name by id; a miss falls back to "???", the same marker
 * `doorsFromRoomPerspective` uses for a missing join.
 */
export function doorTitle(door: DoorTitleRow, names: ReadonlyMap<string, string>): string {
  const arrow = VERTICAL_DOOR_KINDS.has(door.door_kind) ? "↓" : "→";
  const from = names.get(door.from_location_id) ?? "???";
  const to = names.get(door.to_location_id) ?? "???";
  return `${from} ${arrow} ${to}`;
}

export interface DoorSubtitleRow {
  door_kind: DoorKind;
  is_secret: boolean;
  starts_locked: boolean;
  lock_note: string | null;
  label: string;
}

/**
 * "Secret · behind the ash-screen" / "Locked · the brass key" / "Stair ·
 * one-way descent" — whichever fact about the door matters most to a DM
 * scanning the list, then the free-text detail that goes with it. Priority
 * is secret, then locked, then kind, matching the order the frame's own
 * examples read in: a door that is both secret and locked still leads with
 * "Secret" because that is the fact that gates whether the party can even
 * see the lock note yet.
 */
export function doorSubtitle(door: DoorSubtitleRow): string {
  if (door.is_secret) return door.label ? `Secret · ${door.label}` : "Secret";
  if (door.starts_locked) return door.lock_note ? `Locked · ${door.lock_note}` : "Locked";
  const kind = DOOR_KIND_LABELS[door.door_kind];
  return door.label ? `${kind} · ${door.label}` : kind;
}
