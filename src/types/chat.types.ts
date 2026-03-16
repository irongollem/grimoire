export type MessageType = "chat" | "roll" | "system";

export interface RollMetadata {
  label: string;
  total: number;
  breakdown: { val: number; dropped: boolean }[];
  modifier: number;
  isCrit: boolean;
  isFumble: boolean;
}

export interface CampaignMessage {
  id: string;
  campaign_id: string;
  user_id: string;
  recipient_user_id: string | null;  // null = group, non-null = private whisper
  sender_name: string | null;
  message: string;
  type: MessageType;
  metadata: RollMetadata | null;
  created_at: string;
}

export type CampaignMessageInsert = Pick<
  CampaignMessage,
  "campaign_id" | "user_id" | "recipient_user_id" | "sender_name" | "message" | "type" | "metadata"
>;
