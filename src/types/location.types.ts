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

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  world: "World",
  plane: "Plane",
  continent: "Continent",
  region: "Region",
  country: "Country",
  city: "City",
  town: "Town",
  village: "Village",
  district: "District",
  building: "Building",
  store: "Store",
  tavern: "Tavern",
  inn: "Inn",
  room: "Room",
  dungeon: "Dungeon",
  wilderness: "Wilderness",
  other: "Other",
};

export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  world: "#0f172a",
  plane: "#4c1d95",
  continent: "#1d4ed8",
  region: "#0369a1",
  country: "#0891b2",
  city: "#7c3aed",
  town: "#6d28d9",
  village: "#9333ea",
  district: "#c026d3",
  building: "#b45309",
  store: "#d97706",
  tavern: "#b45309",
  inn: "#92400e",
  room: "#92400e",
  dungeon: "#991b1b",
  wilderness: "#15803d",
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
  player_visible_to: string[];
  player_summary: string | null;
  is_description_shared: boolean;
  is_npcs_shared: boolean;
  is_inventory_shared: boolean;
  npc_owner_id: string | null;
  related_location_ids: string[];
  source_map_id: string | null;
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
  created_at: string;
  updated_at: string;
}

export interface GridCalibration {
  cells_per_image_width: number;
  origin_x_pct: number;
  origin_y_pct: number;
}

export type LocationInsert = Omit<
  Location,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type LocationUpdate = Partial<LocationInsert>;
