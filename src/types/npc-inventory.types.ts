export interface NpcInventoryItem {
  id: string;
  campaign_id: string;
  user_id: string;
  npc_id: string;
  // At most one of these is set — a DB check constraint enforces it. Both null
  // is legal: free-text loot with no catalogue entry behind it. Resolve them
  // through `src/lib/itemRef.ts`, never by reading a column directly.
  item_id: string | null; // the owner's own items row (uuid)
  library_item_id: string | null; // shared library content (text id) — #819
  name: string;
  quantity: number;
  notes: string | null;
  updated_at: string;
}

export type NpcInventoryInsert = Omit<NpcInventoryItem, "id" | "user_id" | "updated_at">;
