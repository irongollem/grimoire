export type SoundCategory = "ambient" | "music" | "effects" | "misc";

/**
 * How big the fire targets are on the board.
 *
 * `sm` is not a shrunken `md` — at that density a DM is firing by position and
 * colour, so the pad drops everything that is not "is it playing". Fewer
 * things on screen, more of them visible at once.
 */
export type PadSize = "sm" | "md" | "lg";

/** Whether the grid shows fire targets only, or fire targets plus their controls. */
export type BoardMode = "perform" | "arrange";
export type SoundSourceType = "upload" | "url" | "spotify" | "freesound" | "library";

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
  /**
   * Only set for the user's own uploads — deleting a sound deletes this object.
   *
   * Null for external URLs, Spotify, and anything from the shared catalogue:
   * a catalogue file is one object that every campaign points at, so recording
   * it here would let one DM's delete take the sound away from everyone.
   */
  storage_path: string | null;
  /**
   * Set when this row came from the curated catalogue (`sound_library`).
   *
   * Two things hang off it: catalogue sounds are exempt from the free tier's
   * cap, and their bucket object is never deleted with the row.
   */
  library_id: string | null;
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
  "id" | "user_id" | "created_at" | "updated_at" | "gain_trim" | "library_id"
> & {
  /** Omit to take the column default of 1.0 (unmodified loudness). */
  gain_trim?: number;
  /** Omit for anything the DM added themselves; only the catalogue sets it. */
  library_id?: string | null;
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
  /**
   * Which curated starter scene this came from, e.g. `tavern`. Null for every
   * playlist a DM built themselves.
   *
   * Set means the playlist is shipped content, which is what exempts it from
   * the free tier's playlist cap.
   */
  library_scene_slug: string | null;
  created_at: string;
  updated_at: string;
}

export type SoundboardPlaylistInsert = Omit<
  SoundboardPlaylist,
  "id" | "user_id" | "created_at" | "updated_at" | "tags" | "library_scene_slug"
> & {
  /** Omit to take the column default of no themes. */
  tags?: string[];
  /** Only the starter-scene builder sets this. */
  library_scene_slug?: string | null;
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

// ── Shared playback ───────────────────────────────────────────────────────

/**
 * What the DM is sharing with remote players, one row per campaign.
 *
 * The track is denormalised rather than referenced so players never need read
 * access to the `sounds` table: this row is a snapshot of exactly what is
 * audible right now, which is all a player is entitled to see.
 */
export interface SoundboardBroadcast {
  id: string;
  campaign_id: string;
  user_id: string;
  /** Off by default and per session — most tables are in one room. */
  is_live: boolean;
  sound_id: string | null;
  track_name: string | null;
  track_url: string | null;
  artist: string | null;
  thumbnail_url: string | null;
  playlist_name: string | null;
  /** Wall clock corresponding to position zero of the current track. */
  started_at: string | null;
  is_paused: boolean;
  /** Where the track froze, so a paused broadcast stops advancing. */
  paused_at: string | null;
  created_at: string;
  updated_at: string;
}

/** The half a DM pushes; identity and timestamps are server-owned. */
export type SoundboardBroadcastState = Pick<
  SoundboardBroadcast,
  | "is_live"
  | "sound_id"
  | "track_name"
  | "track_url"
  | "artist"
  | "thumbnail_url"
  | "playlist_name"
  | "started_at"
  | "is_paused"
  | "paused_at"
>;

// ── Curated catalogue ─────────────────────────────────────────────────────

/**
 * One entry in the shared, free-for-everyone sound catalogue.
 *
 * Half of these columns exist only to record provenance — where the file came
 * from and what the licence obliges us to say about it. That is deliberate:
 * carrying the credit line on the row is what makes CC-BY compliance automatic
 * when a DM adds the sound, rather than something a future change could quietly
 * drop.
 */
export interface SoundLibraryEntry {
  id: string;
  /** Stable id from the curation manifest, e.g. `rain/rain-gutter-loop`. */
  slug: string;
  /** Curator's grouping — how the catalogue is browsed (`rain`, `tavern`). */
  collection: string;
  /** Which mixer bus it lands on when added. */
  category: SoundCategory;
  title: string;
  author: string;
  source: string;
  source_page: string;
  license: string;
  license_url: string | null;
  /** Ready-to-display credit line; null when the licence requires none. */
  attribution: string | null;
  storage_path: string;
  file_url: string;
  duration_seconds: number | null;
  /** Theme labels, so encounter and location triggers work without setup. */
  tags: string[];
  /** True only when the source says so — never inferred from length. */
  is_loopable: boolean;
  gain_trim: number;
  sort_order: number;
  created_at: string;
  updated_at: string;
}
