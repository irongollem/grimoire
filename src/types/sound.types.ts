export type SoundCategory = "ambient" | "music" | "effects" | "misc";
export type SoundSourceType = "upload" | "url" | "spotify" | "freesound";

export interface SoundboardPage {
  id: string;
  campaign_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SoundboardPageInsert = Omit<
  SoundboardPage,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type SoundboardPageUpdate = Partial<
  Pick<SoundboardPage, "name" | "sort_order">
>;

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
  attribution: string | null; // e.g. "Sound by FreesoundUser (CC-BY)" — only set when license requires it
  attribution_url: string | null; // link back to the source page
  thumbnail_url: string | null; // optional cover art — used by Media Session (CarPlay, lock screen, etc.)
  artist: string | null; // e.g. "Vindsvept" — shown in Media Session; defaults to "Dungeon Grimoire"
  gain_trim: number; // loudness-normalisation multiplier applied ahead of user volume; 1.0 = unmodified
  created_at: string;
  updated_at: string;
}

export type SoundInsert = Omit<
  Sound,
  "id" | "user_id" | "created_at" | "updated_at" | "gain_trim"
> & {
  /** Omit to take the column default of 1.0 (unmodified loudness). */
  gain_trim?: number;
};
export type SoundUpdate = Partial<SoundInsert>;

export interface SoundPlaybackState {
  isPlaying: boolean;
  volume: number; // 0–1
  isLooping: boolean;
  currentTime: number; // seconds
  duration: number; // seconds (0 = unknown / not yet loaded)
  loadError: boolean; // true after a load failure persists past one retry
}

// ── Audio effects ─────────────────────────────────────────────────────────

export type AudioEffectPreset =
  | "none"
  | "through_door"
  | "through_wall"
  | "distant"
  | "underwater"
  | "cave"
  | "sewer";

// ── Playlists ─────────────────────────────────────────────────────────────

export type PlaylistType = "music" | "ambient";

export interface SoundboardPlaylist {
  id: string;
  campaign_id: string;
  user_id: string;
  page_id: string | null;
  name: string;
  playlist_type: PlaylistType;
  shuffle: boolean;
  repeat: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export type SoundboardPlaylistInsert = Omit<
  SoundboardPlaylist,
  "id" | "user_id" | "created_at" | "updated_at"
>;
export type SoundboardPlaylistUpdate = Partial<
  Pick<
    SoundboardPlaylist,
    "name" | "playlist_type" | "shuffle" | "repeat" | "sort_order"
  >
>;

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  sound_id: string;
  sort_order: number;
  created_at: string;
}

export interface PlaylistTrackWithSound extends PlaylistTrack {
  sound: Sound;
}
