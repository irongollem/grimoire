export interface PartyInventoryItem {
  id: string;
  campaign_id: string;
  user_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  carried_by: string | null; // party_member id
  is_attuned: boolean;
  notes: string | null;
  updated_at: string;
}

export type PartyInventoryInsert = Omit<PartyInventoryItem, "id" | "user_id" | "updated_at">;
export type PartyInventoryUpdate = Partial<Pick<PartyInventoryItem, "quantity" | "carried_by" | "is_attuned" | "notes" | "name">>;
