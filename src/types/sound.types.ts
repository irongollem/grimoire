export type SoundCategory = "ambient" | "music" | "effects" | "misc";
export type SoundSourceType = "upload" | "url";

export interface Sound {
  id: string;
  user_id: string;
  campaign_id: string;
  name: string;
  category: SoundCategory;
  source_type: SoundSourceType;
  file_url: string; // public URL (Supabase storage) or external URL
  storage_path: string | null; // only set for uploads; null for external URLs
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type SoundInsert = Omit<Sound, "id" | "user_id" | "created_at" | "updated_at">;
export type SoundUpdate = Partial<SoundInsert>;

export interface SoundPlaybackState {
  isPlaying: boolean;
  volume: number; // 0–1
  isLooping: boolean;
}
