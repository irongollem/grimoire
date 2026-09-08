// ── Named, directional connections between rooms in one site (#785, epic #780) ──
//
// `parent_id` already says a room sits inside a site; nothing said two rooms
// *connect*, so "the nave opens onto the reliquary, but the abbot's cell is
// barred from the outside" lived only in the DM's head. A door names that
// connection, gives it a direction, and gives it a reason it might not open.
//
// Both endpoints must be `room`-typed locations sharing the same parent —
// enforced server-side by the `guard_location_door_endpoints` trigger
// (migration `20260904061014`). This file does not re-derive that rule; a
// rejection surfaces to the DM as a toast instead.
//
// DELIBERATELY AUTHORED STATE ONLY. `starts_locked` and `is_secret` describe
// what the DM prepared. Whether the party has since opened or found the door
// is *play* state and belongs to the durable-site-state log in #787 — do not
// add `is_locked` / `is_discovered` here, or anywhere that reads this type.

export interface LocationDoor {
  id: string;
  user_id: string;
  from_location_id: string;
  to_location_id: string;
  /** "iron grille", "collapsed stair" — free text, read aloud rather than
   *  branched on. */
  label: string;
  /** false: passable both ways. true: from -> to only (a one-way chute, a
   *  door barred from the far side). */
  is_one_way: boolean;
  starts_locked: boolean;
  /** What opens it — "the brass key", "DC 15 thieves' tools". */
  lock_note: string | null;
  /** A door the party cannot see until they find it. */
  is_secret: boolean;
  /** Manual order among a room's ways out; `null` sorts last. No reordering
   *  UI ships with #785 — the column exists so #787 (or a later story) can
   *  add one without another migration. */
  sort_order: number | null;
  created_at: string;
  updated_at: string;
}

export interface LocationDoorInsert {
  from_location_id: string;
  to_location_id: string;
  /** Omit to take the column default of `''`. */
  label?: string;
  /** Omit to take the column default of `false`. */
  is_one_way?: boolean;
  /** Omit to take the column default of `false`. */
  starts_locked?: boolean;
  lock_note?: string | null;
  /** Omit to take the column default of `false`. */
  is_secret?: boolean;
  sort_order?: number | null;
}

/** Endpoints are excluded on purpose — the guard trigger validates them as a
 *  pair, so changing one after creation is a delete-and-recreate, not an
 *  update. */
export type LocationDoorUpdate = Partial<
  Pick<LocationDoorInsert, "label" | "is_one_way" | "starts_locked" | "lock_note" | "is_secret" | "sort_order">
>;
