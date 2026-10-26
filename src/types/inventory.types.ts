export type InventorySlot =
  | "head"
  | "neck"
  | "shoulders"
  | "body"
  | "clothes"
  | "hands"
  | "ring"
  | "waist"
  | "feet"
  | "main_hand"
  | "off_hand"
  | "other";

export type InventoryLocation =
  | "equipped"
  | "belt"
  | "backpack"
  | "container"
  | "stored";

/** A row's condition (#1102), worst to best. Crafting reads it through `src/lib/items/quality.ts`. */
export type ItemQuality = "ruined" | "poor" | "standard" | "fine" | "masterwork";

export interface PartyInventoryItem {
  id: string;
  campaign_id: string;
  user_id: string;
  // At most one of these is set — a DB check constraint enforces it. Both null
  // is legal: free-text loot with no catalogue entry behind it. Resolve them
  // through `src/lib/itemRef.ts`, never by reading a column directly.
  item_id: string | null; // the owner's own items row (uuid)
  library_item_id: string | null; // shared library content (text id) — #815
  name: string;
  quantity: number;
  carried_by: string | null; // party_member id; null = party stash
  location: InventoryLocation;
  slot: InventorySlot | null; // only set when location = 'equipped'
  is_container: boolean;
  container_id: string | null; // only set when location = 'container'
  is_attuned: boolean;
  is_equipped: boolean; // legacy; derived from location='equipped'
  notes: string | null;
  current_charges: number | null; // remaining charges; null = full (use Item.charges as max)
  updated_at: string;
  is_identified: boolean; // false = players see only mundane_description
  quality: ItemQuality; // #1102: replaced the ruined flag; "ruined" rows can never be spent
  sort_order: number;
  curse_revealed: boolean; // DM-toggled: players only see curse_description when true
}

export type PartyInventoryInsert = Omit<
  PartyInventoryItem,
  "id" | "user_id" | "updated_at" | "current_charges" | "sort_order" | "is_identified" | "curse_revealed" | "quality"
> & { quality?: ItemQuality; current_charges?: number | null; sort_order?: number; is_identified?: boolean; curse_revealed?: boolean };
export type PartyInventoryUpdate = Partial<
  Pick<
    PartyInventoryItem,
    | "quantity"
    | "carried_by"
    | "location"
    | "slot"
    | "is_container"
    | "container_id"
    | "is_attuned"
    | "is_equipped"
    | "is_identified"
    | "notes"
    | "name"
    | "current_charges"
    | "sort_order"
    | "curse_revealed"
    | "quality"
  >
>;
