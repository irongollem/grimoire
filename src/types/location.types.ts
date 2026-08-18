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
 * Declaration order is **scale order**, matching the ladder in
 * `lib/locations/tiers`. Both type dropdowns — the DM Atlas and the player
 * portal — build their options by iterating this record, so the order here is
 * the order a user reads, and an alphabetical or arbitrary sort would put a
 * broom closet between two continents.
 */
export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  world: "World",
  plane: "Plane",

  continent: "Continent",
  region: "Region",
  country: "Country",

  city: "City",
  town: "Town",
  village: "Village",

  dungeon: "Dungeon",
  district: "District",
  building: "Building",
  wilderness: "Wilderness",

  store: "Store",
  tavern: "Tavern",
  inn: "Inn",

  room: "Room",

  other: "Other",
};

/**
 * Type colours are a **scale ramp, not a palette of kinds** — do not reshuffle
 * these into "a red for dungeons, a green for forests". That was the previous
 * scheme, and it meant colour carried no information the type label did not
 * already carry, while the one thing a DM cannot read from a label — how big
 * this place is relative to that one — went unencoded entirely.
 *
 * The ramp runs cool-to-warm along the scale ladder in `lib/locations/tiers`,
 * which reads as distance: the far and cosmic are cold, the near and enclosed
 * are warm.
 *
 *   cosmic      violet   — the void
 *   continental blue     — lands seen from above
 *   settlement  teal     — where people gather
 *   site        lime     — a place you can walk around
 *   venue       amber    — hearth-light, a room you can stand in
 *   interior    rust     — fully enclosed
 *   other       grey     — no scale claimed
 *
 * Within a tier, lightness steps by **enclosure**, darkest = most enclosed. So
 * `dungeon` is the darkest site and `wilderness` the lightest, which is why
 * they sit in the same hue family despite feeling like opposites — they are
 * the same *scale*, and that is what this channel now means.
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

  city: "#0f766e",
  town: "#14b8a6",
  village: "#2dd4bf",

  dungeon: "#3f6212",
  district: "#4d7c0f",
  building: "#65a30d",
  wilderness: "#84cc16",

  store: "#b45309",
  tavern: "#d97706",
  inn: "#f59e0b",

  room: "#9a3412",

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
   * Optional in-world year bounds. When set, the location is only "current"
   * while the campaign's `current_year` falls within [era_start, era_end]
   * (either bound may be open-ended).
   */
  era_start: number | null;
  era_end: number | null;
  /**
   * Theme label requested from the soundboard when this location is opened;
   * resolves against ambient playlists tagged with it. Null = leave audio
   * alone.
   */
  audio_theme: string | null;
  ai_provenance?: AiProvenance | null;
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
}

export const DEFAULT_GRID_OPACITY = 0.35;

export type LocationInsert = Omit<
  Location,
  "id" | "user_id" | "created_at" | "updated_at" | "audio_theme"
> & {
  /** Omit to take the column default of null — no audio is requested. */
  audio_theme?: string | null;
};
export type LocationUpdate = Partial<LocationInsert>;
