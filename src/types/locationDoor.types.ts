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
// `20260904061014`, widened by `20260908215641`, widened again by `20260915070839`
// for a one-sided door). This file does not re-derive that rule; a rejection
// surfaces to the DM as a toast instead.
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
//
// ── A door is an edge on the plan (#884, migration `20260915070839`) ─────────
//
// A door's two endpoints are no longer picked from a list — they are
// *derived* from whichever traced regions sit either side of `edge_key` on
// the site's plan (`resolveDoorEndpoints`, `src/lib/locations/doors.ts`).
// `source_edge_key` is renamed `edge_key`: the old name said "the Cartographer
// made this"; the column now says *where the door is*, a fact about the door
// whoever drew it — a DM can place one directly on the Atlas's own plan now,
// not only via a Cartographer publish. `to_location_id` is nullable for
// exactly the same reason: a door drawn on an edge with a region on only one
// side is a way out to untraced space, not an error — see
// `resolveDoorEndpoints` for how the traced side always becomes `from`.
// `derived_from` records provenance (`'dm'` | `'publish'`), the same
// `location_map_regions` shape, so a re-publish can hold back a door the DM
// placed by hand on the Atlas plan directly.

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

/** `"x,y:N"` / `"x,y:W"` — the plan edge a door sits on, NW ownership as in
 *  `src/cartographer/edges.ts`. The type name predates #884 and still says
 *  "source" (it was, at the time, always a Cartographer publish); the
 *  *column* it types is `edge_key` now, and means "where", not "from where". */
export type SourceEdgeKey = `${number},${number}:${"N" | "W"}`;

/** `'dm'`: placed or moved by a DM directly on the Atlas plan (the default —
 *  every hand-made door before #884 backfilled to `'publish'` instead, since
 *  an edge key on a pre-#884 row could only have come from one). `'publish'`:
 *  last written by Publish to Atlas. Mirrors `location_map_regions.derived_from`
 *  so a re-publish can hold a DM's own placement back. */
export const DOOR_PROVENANCES = ["dm", "publish"] as const;
export type DoorProvenance = (typeof DOOR_PROVENANCES)[number];

export interface LocationDoor {
  id: string;
  user_id: string;
  from_location_id: string;
  /** Null means this way leads to untraced space — the edge it sits on has a
   *  region on only one side. Resolves itself once the far side is traced;
   *  see `resolveDoorEndpoints`. */
  to_location_id: string | null;
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
  /** Where this door sits on the site's plan grid. Null for a door that has
   *  never been placed — a hand-made row from before #884, or one added from
   *  a form since without using the plan's door tool. See `SiteWaysOutPanel`'s
   *  "Place it" affordance for turning one of those into a placed door. */
  edge_key: SourceEdgeKey | null;
  derived_from: DoorProvenance;
  /** The Secret Door / Hidden Passage / Moving Wall that governs this way out. */
  dungeon_feature_id: string | null;
  created_at: string;
  updated_at: string;
}

export interface LocationDoorInsert {
  from_location_id: string;
  /** Nullable per `LocationDoor.to_location_id` — a door placed on an edge
   *  with a region on only one side. */
  to_location_id: string | null;
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
  edge_key?: SourceEdgeKey | null;
  /** Omit to take the column default of `'dm'`. */
  derived_from?: DoorProvenance;
  dungeon_feature_id?: string | null;
}

/** Both endpoints join `edge_key` as editable together (#884): placing a
 *  door on an edge, or moving an already-placed one to a different edge,
 *  re-derives `from_location_id` AND `to_location_id` as one fact about
 *  where the door now sits (`resolveDoorEndpoints`) — never edited
 *  independently, and never picked from a list. This supersedes whatever a
 *  form-created door's endpoints were before: the plan is the authority once
 *  a door has a position on it. Changing *only* one endpoint, with no edge to
 *  justify it, is still not offered anywhere — that would be "connect this
 *  door to a different room", a different door in every sense that matters. */
export type LocationDoorUpdate = Partial<
  Pick<
    LocationDoorInsert,
    | "from_location_id"
    | "to_location_id"
    | "label"
    | "is_one_way"
    | "starts_locked"
    | "lock_note"
    | "is_secret"
    | "sort_order"
    | "door_kind"
    | "edge_key"
    | "derived_from"
    | "dungeon_feature_id"
  >
>;
