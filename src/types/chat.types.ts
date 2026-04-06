export type MessageType = "chat" | "roll" | "system" | "item_drop" | "currency_drop";

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

export interface FlavorMetadata {
  skill_label: string;
}

export interface CampaignMessage {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_user_id: string | null;  // null = group, non-null = private whisper
  sender_name: string | null;
  message: string;
  type: MessageType;
  metadata: RollMetadata | ItemDropMetadata | CurrencyDropMetadata | FlavorMetadata | null;
  created_at: string;
}

export type CampaignMessageInsert = Pick<
  CampaignMessage,
  "campaign_id" | "user_id" | "recipient_user_id" | "sender_name" | "message" | "type" | "metadata"
>;
