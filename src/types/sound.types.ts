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
  /**
   * Theme labels this playlist can answer, e.g. `["battle", "boss"]`. Matched
   * against an encounter's or location's `audio_theme` — several playlists
   * sharing a label is what gives repeated combats variety without prep.
   */
  tags: string[];
  created_at: string;
  updated_at: string;
}

export type SoundboardPlaylistInsert = Omit<
  SoundboardPlaylist,
  "id" | "user_id" | "created_at" | "updated_at" | "tags"
> & {
  /** Omit to take the column default of no themes. */
  tags?: string[];
};
export type SoundboardPlaylistUpdate = Partial<
  Pick<
    SoundboardPlaylist,
    "name" | "playlist_type" | "shuffle" | "repeat" | "sort_order" | "tags"
  >
>;

export interface PlaylistTrack {
  id: string;
  playlist_id: string;
  sound_id: string;
  sort_order: number;
  created_at: string;
  /** Level of this layer inside its scene, independent of the sound elsewhere. */
  layer_volume: number;
  /** True = fire one-shots at random intervals; false = loop continuously. */
  is_generator: boolean;
  /** Seconds between firings; drawn uniformly from [min, max] each time. */
  min_interval_s: number;
  max_interval_s: number;
  /** Per-firing level multiplier, drawn from [min, max]. */
  min_gain: number;
  max_gain: number;
  /** Stereo spread: 0 = always centred, 1 = anywhere across the field. */
  pan_spread: number;
}

/** Editable layer settings — everything a scene remembers about one of its tracks. */
export type PlaylistTrackLayer = Pick<
  PlaylistTrack,
  | "layer_volume"
  | "is_generator"
  | "min_interval_s"
  | "max_interval_s"
  | "min_gain"
  | "max_gain"
  | "pan_spread"
>;

export const DEFAULT_LAYER: PlaylistTrackLayer = {
  layer_volume: 1,
  is_generator: false,
  min_interval_s: 20,
  max_interval_s: 60,
  min_gain: 0.6,
  max_gain: 1,
  pan_spread: 0.5,
} as const;

export interface PlaylistTrackWithSound extends PlaylistTrack {
  sound: Sound;
}
