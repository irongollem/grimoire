export interface NpcInventoryItem {
  id: string;
  campaign_id: string;
  user_id: string;
  npc_id: string;
  item_id: string | null;
  name: string;
  quantity: number;
  notes: string | null;
  updated_at: string;
}

export type NpcInventoryInsert = Omit<NpcInventoryItem, "id" | "user_id" | "updated_at">;
