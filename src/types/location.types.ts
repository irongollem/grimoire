import type { AiProvenance } from "@/ai/provenance";

export type LocationType =
  | "world"
  | "plane"
  | "continent"
  | "region"
  | "country"
  | "city"
  | "town"
  | "village"
  | "district"
  | "building"
  | "store"
  | "tavern"
  | "inn"
  | "room"
  | "dungeon"
  | "grounds"
  | "wilds"
  | "wilderness"
  | "other";

/** Location types that can hold a store inventory. */
export const STORE_LOCATION_TYPES = new Set<LocationType>([
  "store",
  "tavern",
  "inn",
]);

/**
 * "Vague container" types that represent an area rather than a single mappable
 * point. When the DM picks pins for a location's map we recurse *through* these
 * to find more concrete descendants to offer (e.g. a "Ten Towns" region under
 * an "Icewind Dale" map surfaces the individual towns, not the region itself).
 * Leaf vague containers (no children) are still offered as a fallback.
 */
export const VAGUE_LOCATION_TYPES = new Set<LocationType>([
  "world",
  "plane",
  "continent",
  "region",
  "country",
]);

/**
 * Declaration order is **ladder order**, matching `lib/locations/tiers`. Both
 * type dropdowns — the DM Atlas and the player portal — build their options
 * by iterating this record, so the order here is the order a user reads, and
 * an alphabetical or arbitrary sort would put a broom closet between two
 * continents.
 */
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  world: "World",
  plane: "Plane",

  continent: "Continent",
  region: "Region",
  country: "Country",
  wilderness: "Wilderness",

  city: "City",
  town: "Town",
  village: "Village",

  district: "District",

  building: "Building",
  dungeon: "Dungeon",
  store: "Store",
  tavern: "Tavern",
  inn: "Inn",
  wilds: "Wilds",

  room: "Room",
  grounds: "Grounds",

  other: "Other",
};

/**
 * Type colours are a **tier ramp, not a palette of kinds** — do not reshuffle
 * these into "a red for dungeons, a green for forests". That was the previous
 * scheme, and it meant colour carried no information the type label did not
 * already carry, while the one thing a DM cannot read from a label — what
 * kind of map this place gets, and how its children sit on it — went
 * unencoded entirely.
 *
 * The ramp runs cool-to-warm along the ladder in `lib/locations/tiers`, which
 * reads as distance: the far and cosmic are cold, the near and enclosed are
 * warm.
 *
 *   cosmic      violet   — the void
 *   land        blue     — no floor plan, seen from above (continent, region,
 *                          country, wilderness — pins all the way down)
 *   settlement  teal     — where people gather
 *   district    lime     — geography one step in: still pins, not a floor plan
 *   site        amber    — a floor plan; hearth-light, walls you can trace
 *   interior    rust     — fully enclosed
 *   other       grey     — no tier claimed
 *
 * Within a tier, lightness steps by **enclosure**, darkest = most enclosed.
 * `land` runs continent → region → country → wilderness, lightest last:
 * `wilderness` is the least enclosed thing on the ladder. `site` now steps
 * six types — dungeon (underground, windowless) darkest, then building, then
 * store/tavern/inn, then `wilds` lightest of all: it is a site with a floor
 * plan (regions, doors, placements) but no roof, so it takes the site ramp's
 * lightest rung rather than a hue of its own. `dungeon` and `wilderness` no
 * longer share a hue family; under the old ladder they did, which was the bug
 * (#810) — they are not the same kind of map, whatever their footprint on the
 * page.
 *
 * `interior` also now steps two types instead of one (#886): `room` darkest
 * — walled and roofed, fully enclosed — then `grounds` lighter — an outdoor
 * area *inside* a site (a glade, a grave plot, a hedge maze), open air like
 * `wilds` but bound to a floor plan the way a room is, not a site of its own.
 * `grounds` and `wilds` sit one hue-step apart across the site/interior seam
 * rather than sharing a family, the same reasoning as `dungeon`/`wilderness`:
 * a wood the party walks through *is* a site (it has its own floor plan);
 * a clearing traced inside another site's floor plan is one of its rooms.
 *
 * Values stay 6-digit hex: several call sites append an alpha pair
 * (`LOCATION_TYPE_COLORS[t] + "22"`) to derive a tint.
 */
export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  world: "#6d28d9",
  plane: "#8b5cf6",

  continent: "#1d4ed8",
  region: "#3b82f6",
  country: "#60a5fa",
  wilderness: "#93c5fd",

  city: "#0f766e",
  town: "#14b8a6",
  village: "#2dd4bf",

  district: "#4d7c0f",

  building: "#92400e",
  dungeon: "#78350f",
  store: "#b45309",
  tavern: "#d97706",
  inn: "#f59e0b",
  wilds: "#fbbf24",

  room: "#9a3412",
  grounds: "#c2410c",

  other: "#6b7280",
};

/** A pin placed on a location's map, pointing to one of its direct children. */
export interface MapPin {
  child_location_id: string;
  /** Denormalised so players can read without a separate location query. */
  child_name: string;
  child_type: LocationType;
  /** Sigil/emblem image URL — shown inside the hover token. */
  child_image_url: string | null;
  /** Fraction of map width (0–1). */
  x: number;
  /** Fraction of map height (0–1). */
  y: number;
  visible_to_players: boolean;
}

export interface Location {
  id: string;
  user_id: string;
  campaign_id: string | null;
  parent_id: string | null;
  name: string;
  location_type: LocationType;
  description: string | null; // Tiptap JSON
  notes: string | null;
  tags: string[];
  image_url: string | null;
  map_url: string | null;
  map_pins: MapPin[];
  is_map_shared: boolean;
  /**
   * Party member ids this location is revealed to; `[]` is nobody.
   *
   * This column allowed NULL until `20260817224804_constrain_player_visible_to`,
   * and a reveal control that indexed straight into it took the whole Atlas down
   * on the first location nobody had ever shared. That migration backfills and
   * constrains all six affected tables, so the type is `string[]` here and on
   * every sibling entity — one shape, no per-entity variance to rediscover.
   */
  player_visible_to: string[];
  player_summary: string | null;
  is_description_shared: boolean;
  is_npcs_shared: boolean;
  is_inventory_shared: boolean;
  npc_owner_id: string | null;
  related_location_ids: string[];
  source_map_id: string | null;
  /**
   * Shipped source that seeded this row via Populate Setting — a setting key, or
   * `'planar'` for the standard planes; null when the user made it. Content we
   * ship does not count against free-tier quotas — see `check_quota` and
   * `lib/populateSetting/settingContent`.
   */
  setting_source?: string | null;
  /**
   * Marks this location's map as a tactical battle map. When true, the map is
   * hidden from the player atlas (so fog of war isn't trivially bypassed) and
   * the VTT layer enables grid calibration, token drag, and fog.
   */
  is_battle_map: boolean;
  /**
   * VTT battle map grid calibration for `map_url`. When set, the VTT layer can
   * overlay a 5-ft grid and snap tokens. `cells_per_image_width` is the count
   * of 5-ft squares spanning the image's natural width; `origin_x_pct` /
   * `origin_y_pct` (0–1) place cell (0,0) on the image.
   */
  grid_calibration: GridCalibration | null;
  /**
   * The Drawing layer: a transparent bake of the Cartographer drawing in
   * `source_map_id`, re-baked on every save of the drawing. Null when the
   * site has no drawing. Site map stack (#884) — read through
   * `lib/locations/mapStack.ts`, never directly.
   */
  map_layer_url: string | null;
  /**
   * `GridCalibration` of `map_layer_url`, computed by Publish from the
   * bake's own padding — never eyeballed. Null iff `map_layer_url` is null.
   */
  map_layer_calibration: GridCalibration | null;
  /**
   * `{cols, rows}` for a site whose Plan is traced on a blank grid with no
   * Picture and no Drawing beneath it. Null otherwise.
   */
  plan_size: { cols: number; rows: number } | null;
  /**
   * Optional in-world year bounds. When set, the location is only "current"
   * while the campaign's `current_year` falls within [era_start, era_end]
   * (either bound may be open-ended).
   */
  era_start: number | null;
  era_end: number | null;
  /**
   * Theme label requested from the soundboard when the DM presses Play
   * ambience on this place in the Atlas (`useAmbiencePlayback`), or when the party actually
   * arrives here during a session (`usePartyAmbience`, #790); resolves
   * against ambient playlists tagged with it.
   *
   * Null = INHERIT (#868): walk up `parent_id` to the nearest ancestor with a
   * theme, so a dungeon themed once themes every room. The reserved label
   * `SILENCE_THEME` (`lib/audio/audioThemes.ts`) is authorable silence — it
   * resolves to nothing and stops the walk. A top-level location with null
   * is still "leave audio alone".
   */
  audio_theme: string | null;
  /**
   * Manual order among siblings; `null` sorts last ("no order claimed yet").
   * Written only by the `reorder_locations` RPC — ordinary saves never touch
   * it, so rearranging siblings doesn't bump `updated_at` or invalidate the
   * embedding source hash. See `lib/locations/tree`'s `compareSiblings` for
   * the full sort key (tier, then this, then name).
   */
  sort_order: number | null;
  ai_provenance?: AiProvenance | null;
  /**
   * The `dungeon_maps.rev` the last Publish to Atlas carried (#868). Null =
   * never published from the Cartographer — a scanned page, a photo. Compared
   * against the live map's `rev` to say "the drawing moved on".
   */
  map_published_rev: number | null;
  created_at: string;
  updated_at: string;
}

export interface GridCalibration {
  cells_per_image_width: number;
  origin_x_pct: number;
  origin_y_pct: number;
  /**
   * Display opacity for grid line overlays on this map, 0..1. Useful for
   * maps that already ship with painted gridlines (Cartographer bakes,
   * pre-printed tile maps) — the DM can dim or hide the overlay so the
   * underlying grid does the visual work. Defaults to 0.35 when omitted.
   */
  grid_opacity?: number;
  /**
   * The map-cell coordinate — in the authoring tool's own cell space, e.g.
   * a Cartographer `DungeonMap`'s `CellKey` (`src/types/dungeonMap.types.ts`)
   * — that corresponds to image cell (0,0): the cell whose top-left corner
   * sits at (`origin_x_pct`, `origin_y_pct`).
   *
   * Exists because a baked map image is not a 1:1 crop of the authored map:
   * `src/cartographer/bake.ts` pads the painted bounding box by
   * `DEFAULT_BAKE_PADDING_CELLS` (3) cells on every side, so image cell (0,0)
   * is that *padded* corner, not the map's own (0,0) — it is map cell
   * `(minX - padding, minY - padding)`. Without this offset, anything that
   * resolves a traced/painted region back to its authored map cell
   * (encounters, traps, features keyed by `CellKey`) would silently drift by
   * the padding amount.
   *
   * Optional, defaulting to (0, 0) so every calibration written before this
   * field existed — including the ones `useMapExport.ts` already wrote with
   * an implicit (0,0) — keeps resolving exactly as it did before.
   */
  origin_cell_x?: number;
  origin_cell_y?: number;
}

export const DEFAULT_GRID_OPACITY = 0.35;

export type LocationInsert = Omit<
  Location,
  | "id"
  | "user_id"
  | "created_at"
  | "updated_at"
  | "audio_theme"
  | "sort_order"
  | "map_published_rev"
  | "map_layer_url"
  | "map_layer_calibration"
  | "plan_size"
> & {
  /** Omit to take the column default of null — no audio is requested. */
  audio_theme?: string | null;
  /** Omit to take the column default of null — the DM hasn't arranged this yet. */
  sort_order?: number | null;
  /** Written by Publish to Atlas only. */
  map_published_rev?: number | null;
  /** Omit to take the column default of null — no drawing yet. */
  map_layer_url?: string | null;
  /** Omit to take the column default of null — no drawing yet. */
  map_layer_calibration?: GridCalibration | null;
  /** Omit to take the column default of null — no blank-grid plan yet. */
  plan_size?: { cols: number; rows: number } | null;
};
export type LocationUpdate = Partial<LocationInsert>;
