export type MessageType = "chat" | "roll" | "system" | "item_drop" | "currency_drop" | "vendor_offer" | "player_offer" | "loot_chest";

export interface RollMetadata {
  label: string;
  total: number;
  breakdown: { val: number; dropped: boolean }[];
  modifier: number;
  isCrit: boolean;
  isFumble: boolean;
}

export interface ItemDropMetadata {
  item_id: string | null;
  item_name: string;
  item_rarity: string | null;
  quantity: number;
  image_url?: string | null;
  description?: string | null;
  claimed_by_user_id: string | null;
  claimed_by_name: string | null;
  claimed_party_member_id: string | null; // null when claimed to stash or NPC inventory
  npc_id?: string | null; // present when claimed into a specific NPC's inventory
}

export interface CurrencyDropMetadata {
  label: string | null;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
  claimed_by_user_id: string | null;
  claimed_by_name: string | null;
  claimed_party_member_id: string | null;
}

export interface VendorOfferMetadata {
  description: string;          // what is being sold / flavor text
  item_name: string | null;     // if set, added to buyer's inventory on payment
  item_id: string | null;       // optional vault item link
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
  paid_by_user_id: string | null;
  paid_by_name: string | null;
  paid_party_member_id: string | null;
}

export interface PlayerOfferMetadata {
  item_name: string;
  item_id: string | null;
  inventory_item_id: string;        // party_inventory row being sold
  quantity: number;
  pp: number;
  gp: number;
  ep: number;
  sp: number;
  cp: number;
  seller_party_member_id: string;   // needed to credit money after sale
  sold_to_user_id: string | null;
  sold_to_name: string | null;
  sold_to_party_member_id: string | null; // null when sold to DM
}

export interface FlavorMetadata {
  skill_label: string;
}

// ── Loot chest (issue #121, part B) ──────────────────────────────────────────
//
// Posted by the DM via the "Drop in chat" button on a loot table. Each
// chest carries a flat list of `rolled_atoms` (an entry with qty 2 expands
// to two atoms with the same item_id but distinct atom_id), plus a
// `claims_total` cap rolled from a dice expression at drop time.
//
// Players race to click — the `claim_loot_chest_atom()` Postgres RPC
// (migration 20260414000012) takes a row lock so concurrent clicks
// serialise. Once `claims.length === claims_total` the chest is empty.

export interface LootChestAtom {
  /** Stable client uuid — primary key when racing to claim. */
  atom_id: string;
  item_id: string | null;
  item_name: string;
  item_image_url?: string | null;
  item_rarity?: string | null;
}

export interface LootChestClaim {
  atom_id: string;
  claimed_by_user_id: string;
  claimed_by_name: string;
  claimed_at: string;  // ISO timestamp
}

export interface LootChestMetadata {
  /** Snapshot of the source loot table (id may be null if the table was deleted). */
  loot_table_id: string | null;
  loot_table_name: string;
  /** Optional DM-provided chest art (uploaded to asset-images). */
  chest_image_url: string | null;
  /** Total atoms rolled — may differ from claims_total when a chest spawns more
   *  items than it can dispense. */
  rolled_atoms: LootChestAtom[];
  /** Atoms that have been claimed. Length === claims_total → chest empty. */
  claims: LootChestClaim[];
  /** Cap on how many atoms can be claimed from this chest. Rolled at drop time
   *  from the DM's dice expression (default 1). */
  claims_total: number;
}

export interface CampaignMessage {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_user_id: string | null;  // null = group, non-null = private whisper
  sender_name: string | null;
  message: string;
  type: MessageType;
  metadata: RollMetadata | ItemDropMetadata | CurrencyDropMetadata | VendorOfferMetadata | PlayerOfferMetadata | FlavorMetadata | LootChestMetadata | null;
  created_at: string;
}

export type CampaignMessageInsert = Pick<
  CampaignMessage,
  "campaign_id" | "user_id" | "recipient_user_id" | "sender_name" | "message" | "type" | "metadata"
>;
