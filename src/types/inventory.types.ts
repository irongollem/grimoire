export type InventorySlot =
  | "head"
  | "neck"
  | "shoulders"
  | "body"
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

export interface PartyInventoryItem {
  id: string;
  campaign_id: string;
  user_id: string;
  item_id: string | null;
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
  is_ruined: boolean;
}

export type PartyInventoryInsert = Omit<
  PartyInventoryItem,
  "id" | "user_id" | "updated_at" | "current_charges"
> & { current_charges?: number | null };
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
    | "notes"
    | "name"
    | "current_charges"
  >
>;
