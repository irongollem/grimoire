export type SoundCategory = "ambient" | "music" | "effects" | "misc";
export type SoundSourceType = "upload" | "url" | "spotify";

export interface SoundboardPage {
  id: string;
  campaign_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SoundboardPageInsert = Omit<SoundboardPage, "id" | "user_id" | "created_at" | "updated_at">;
export type SoundboardPageUpdate = Partial<Pick<SoundboardPage, "name" | "sort_order">>;

export interface Sound {
  id: string;
  user_id: string;
  campaign_id: string;
  page_id: string | null;
  name: string;
  category: SoundCategory;
  source_type: SoundSourceType;
  file_url: string; // public URL (Supabase storage), external URL, or Spotify URL
  storage_path: string | null; // only set for uploads; null for external URLs and Spotify
  tags: string[];
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SoundInsert = Omit<Sound, "id" | "user_id" | "created_at" | "updated_at">;
export type SoundUpdate = Partial<SoundInsert>;

export interface SoundPlaybackState {
  isPlaying: boolean;
  volume: number; // 0–1
  isLooping: boolean;
  currentTime: number; // seconds
  duration: number;    // seconds (0 = unknown / not yet loaded)
}
