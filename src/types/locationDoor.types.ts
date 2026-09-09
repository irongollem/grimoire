// ── Named, directional connections between rooms in one site (#785, epic #780) ──
//
// `parent_id` already says a room sits inside a site; nothing said two rooms
// *connect*, so "the nave opens onto the reliquary, but the abbot's cell is
// barred from the outside" lived only in the DM's head. A door names that
// connection, gives it a direction, and gives it a reason it might not open.
//
// Both endpoints must be *bindable spaces* — a `room`, or a nested site with
// its own floor plan — sharing the same parent (#868 widened this from
// room-only, so a stair between Level 1 and Level 2 is one row). Enforced
// server-side by the `guard_location_door_endpoints` trigger (migration
// `20260904061014`, widened by `20260908215641`). This file does not
// re-derive that rule; a rejection surfaces to the DM as a toast instead.
//
// A way out also has a `door_kind` (#868). `label` stays free text and is what
// is read aloud; the kind is what the renderer and the levels rail branch on
// — an arch draws thin, a stair draws as a stair and lists as vertical. That
// is the line between a label and a kind. A door may also cite the dungeon
// feature that conceals or opens it (`dungeon_feature_id`), so a secret
// door's perception DC lives where it was authored, not retyped as prose.
//
// DELIBERATELY AUTHORED STATE ONLY. `starts_locked` and `is_secret` describe
// what the DM prepared. Whether the party has since opened or found the door
// is *play* state and lives in the durable-site-state log as door facts
// (`unlocked`, `found` — `locationState.types.ts`, #868). Do not add
// `is_locked` / `is_discovered` here, or anywhere that reads this type.

export const DOOR_KINDS = ["door", "arch", "stair", "shaft", "portal"] as const;
export type DoorKind = (typeof DOOR_KINDS)[number];

export const DOOR_KIND_LABELS: Record<DoorKind, string> = {
  door: "Door",
  arch: "Arch",
  stair: "Stair",
  shaft: "Shaft",
  portal: "Portal",
};

/** The kinds that join two levels rather than two rooms on one floor. */
export const VERTICAL_DOOR_KINDS: ReadonlySet<DoorKind> = new Set(["stair", "shaft"]);

/** `"x,y:N"` / `"x,y:W"` — the Cartographer edge a published way out derived
 *  from, NW ownership as in `src/cartographer/edges.ts`. */
export type SourceEdgeKey = `${number},${number}:${"N" | "W"}`;

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
  door_kind: DoorKind;
  /** Null for every hand-made door, forever. */
  source_edge_key: SourceEdgeKey | null;
  /** The Secret Door / Hidden Passage / Moving Wall that governs this way out. */
  dungeon_feature_id: string | null;
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
  /** Omit to take the column default of `'door'`. */
  door_kind?: DoorKind;
  source_edge_key?: SourceEdgeKey | null;
  dungeon_feature_id?: string | null;
}

/** Endpoints are excluded on purpose — the guard trigger validates them as a
 *  pair, so changing one after creation is a delete-and-recreate, not an
 *  update. */
export type LocationDoorUpdate = Partial<
  Pick<
    LocationDoorInsert,
    | "label"
    | "is_one_way"
    | "starts_locked"
    | "lock_note"
    | "is_secret"
    | "sort_order"
    | "door_kind"
    | "source_edge_key"
    | "dungeon_feature_id"
  >
>;
