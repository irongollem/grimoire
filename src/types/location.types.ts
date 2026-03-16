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
  | "room"
  | "dungeon"
  | "wilderness"
  | "other";

export const LOCATION_TYPE_LABELS: Record<LocationType, string> = {
  world:      "World",
  plane:      "Plane",
  continent:  "Continent",
  region:     "Region",
  country:    "Country",
  city:       "City",
  town:       "Town",
  village:    "Village",
  district:   "District",
  building:   "Building",
  room:       "Room",
  dungeon:    "Dungeon",
  wilderness: "Wilderness",
  other:      "Other",
};

export const LOCATION_TYPE_COLORS: Record<LocationType, string> = {
  world:      "#0f172a",
  plane:      "#4c1d95",
  continent:  "#1d4ed8",
  region:     "#0369a1",
  country:    "#0891b2",
  city:       "#7c3aed",
  town:       "#6d28d9",
  village:    "#9333ea",
  district:   "#c026d3",
  building:   "#b45309",
  room:       "#92400e",
  dungeon:    "#991b1b",
  wilderness: "#15803d",
  other:      "#6b7280",
};

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
  created_at: string;
  updated_at: string;
}

export type LocationInsert = Omit<Location, "id" | "user_id" | "created_at" | "updated_at">;
export type LocationUpdate = Partial<LocationInsert>;
