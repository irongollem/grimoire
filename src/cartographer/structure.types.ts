// ── What a drawing means: the derived structure (#868) ───────────────────────
//
// The Cartographer stores a picture's worth of cells. Publish to Atlas needs
// the *structure* behind it — which cells form a space, which edges are ways
// out, what an annotation names, which cell metadata rides along — and this
// file is the contract between the two halves that produce and consume it:
//
//   src/cartographer/structure.ts   derives a `DerivedStructure` from a
//                                   `DungeonMap` (flood fill cut at every edge
//                                   segment and every solid block, door edges
//                                   between two spaces, stairs, annotations,
//                                   zones, cell links)
//   src/lib/locations/publish.ts    reconciles it against what the Atlas
//                                   already holds and produces a plan the
//                                   review modal shows and the write path
//                                   applies
//
// Everything here is in the map's OWN cell space (the Cartographer's
// `CellKey`), not the baked image's. `grid_calibration.origin_cell_x/y` is
// what relates the two, and the publish writes it, so the Atlas's regions
// use the same keys as the drawing and the same keys as `CellMetadata`.
//
// Keys (`DerivedSpace.key` etc.) are stable within ONE derivation only. They
// are for joining the parts of a structure to each other — a way out names
// the two spaces it joins — never for reconciling across publishes. That is
// what `signature` (a space) and `edgeKey` (a way out) are for.

import type { CellKey, CellMetadata } from "@/types/dungeonMap.types";
import type { SourceEdgeKey } from "@/types/locationDoor.types";
import type { ZoneKind } from "@/types/locationMapRegion.types";

export interface DerivedSpace {
  /** `s:<lowest cell key>` — stable within this derivation. */
  key: string;
  /** Sorted, unique. */
  cells: CellKey[];
  /** `cellSignature(cells)` — the identity a re-publish reconciles on. */
  signature: string;
  /** Text of the first annotation whose cell lies inside this space, or
   *  null. "Throne Room" typed once in the editor is the room's name. */
  name: string | null;
  /** Where the name came from; the region's `derived_from` when created. */
  nameSource: "annotation" | null;
}

export interface DerivedWay {
  /** Canonical NW edge (`edges.ts`), which is also `location_doors.source_edge_key`. */
  edgeKey: SourceEdgeKey;
  /** `doorClosed` → `door`, `doorOpen` → `arch`. */
  kind: "door" | "arch";
  /** The space owning the edge's cell (the cell whose N or W edge it is). */
  fromKey: string;
  /** The space on the other side of the edge. */
  toKey: string;
}

export interface DerivedStair {
  cellKey: CellKey;
  direction: "up" | "down";
  /** The space containing the cell, or null when the stair sits on a cell
   *  no space claims. Its far end is never guessed — the review asks. */
  spaceKey: string | null;
}

export interface DerivedZone {
  /** `ZoneCell.zone_id` from the drawing. */
  zoneId: string;
  kind: ZoneKind;
  label: string | null;
  /** Sorted, unique. */
  cells: CellKey[];
  signature: string;
}

export interface DerivedLink {
  cellKey: CellKey;
  /** The space containing the cell, or null — a link on a corridor cell no
   *  space claims still publishes, as a room-less note the review lists. */
  spaceKey: string | null;
  metadata: CellMetadata;
}

export interface DerivedStructure {
  spaces: DerivedSpace[];
  ways: DerivedWay[];
  stairs: DerivedStair[];
  zones: DerivedZone[];
  links: DerivedLink[];
}
