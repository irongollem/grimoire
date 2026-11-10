import type { Scene } from "@/lib/bookNook/scene";

/** What the Table screen shows while no fight runs (`campaigns.table_shows`). */
export type TableShows = "map" | "picture";

/** A Book Nook: a layered painting moved a little by code (#1142). */
export interface BookNook {
  id: string;
  user_id: string;
  campaign_id: string;
  title: string;
  scene: Scene;
  /** The first frame, every cut-out in place; written to the place's picture. */
  still_url: string | null;
  /** Bumped by every save; a stale tab's save matches no row. */
  rev: number;
  created_at: string;
  updated_at: string;
}

export interface BookNookInsert {
  title: string;
  scene: Scene;
  still_url?: string | null;
}

export interface BookNookUpdate {
  title?: string;
  scene?: Scene;
  still_url?: string | null;
}

export type NookPartGroup = "fire" | "cloth" | "creatures" | "air" | "frames";

export interface CutoutPreset {
  hold?: "stands" | "hangs" | "floats";
  motion?: "Flame" | "Cloth" | "Hanging" | "Wagging" | "Floating" | "Wandering";
}

/** How a frame meets a screen of another shape: `slice` keeps its ornaments and stretches the plain bands, `cover` scales evenly and crops. */
export type FrameFit = "slice" | "cover";

export interface FramePreset {
  shape: "tall" | "wide";
  fit?: FrameFit;
}

interface LibraryNookPartBase {
  id: string;
  group_key: NookPartGroup;
  name: string;
  image_url: string | null;
  sort_order: number;
  source: string;
  created_at: string;
  updated_at: string;
}

export type LibraryNookPart =
  | (LibraryNookPartBase & { kind: "cutout"; preset: CutoutPreset })
  | (LibraryNookPartBase & { kind: "frame"; preset: FramePreset });
