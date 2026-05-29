export interface ChroniclerImage {
  id: string;
  campaign_id: string;
  user_id: string;
  image_url: string | null;
  prompt: string;
  size: string;
  created_at: string;
  status: "pending" | "ready" | "failed";
  error: string | null;
}

export type ChroniclerImageInsert = Pick<ChroniclerImage, "campaign_id" | "user_id" | "image_url" | "prompt" | "size">;

export type ChroniclerSize = "1024x1024" | "1536x1024";

export type ImageJobKind =
  | "chronicler"
  | "group_portrait"
  | "npc_portrait"
  | "monster"
  | "item"
  | "spell"
  | "faction"
  | "location";
