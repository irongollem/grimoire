export interface ChroniclerImage {
  id: string;
  campaign_id: string;
  user_id: string;
  image_url: string;
  prompt: string;
  size: string;
  created_at: string;
}

export type ChroniclerImageInsert = Pick<ChroniclerImage, "campaign_id" | "image_url" | "prompt" | "size">;

export type ChroniclerSize = "1024x1024" | "1536x1024";
