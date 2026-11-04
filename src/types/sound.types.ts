/**
 * One per bus (music, ambient, effects). `misc` went in #1136: production held
 * none, and it quietly played through the ambience bus.
 */
export type SoundCategory = "ambient" | "music" | "effects";

export type SoundSourceType = "upload" | "url" | "spotify" | "freesound" | "library";

export interface SoundboardPage {
  id: string;
  campaign_id: string;
  user_id: string;
  name: string;
  sort_order: number;
  /** Always eight, one per deck column (#1136). The database's CHECK holds it. */
  lanes: DeckLane[];
  created_at: string;
  updated_at: string;
}

export type SoundboardPageInsert = Omit<
  SoundboardPage,
  "id" | "user_id" | "created_at" | "updated_at" | "lanes"
> & { lanes?: DeckLane[] };
export type SoundboardPageUpdate = Partial<
  Pick<SoundboardPage, "name" | "sort_order" | "lanes">
>;

// ── The deck (#1136) ──────────────────────────────────────────────────────

/**
 * A lane is a deck column. `one`: one pad plays at a time, and a new one
 * crossfades the old (new music stops the old). `together`: they overlap
 * (effects never stop the music).
 */
export type DeckLaneRule = "one" | "together";

/**
 * Audio the campaign starts by itself, by where it shows up on the deck: music
 * from a fight or a quest beat, the sound of where the party is, or a quest
 * beat's ambience. Such audio has no pad, so the deck draws it as a passing
 * pad in the lane that takes its feed, and that lane's rule applies to it.
 */
export type DeckFeed = "music" | "place" | "ambience";

export interface DeckLane {
  name: string;
  rule: DeckLaneRule;
  /** Absent or null: nothing the campaign starts shows up here. At most one lane per feed. */
  feed?: DeckFeed | null;
}

/**
 * What a press does, by Ableton's names. Trigger: plays once, every press
 * fires again. Toggle: press to start, press to stop. Gate: plays while held.
 * Repeat: fires again on a beat while held.
 */
export type LaunchMode = "trigger" | "toggle" | "gate" | "repeat";

/** A `soundboard_pads` row. Null settings mean "the default for its kind". */
export interface SoundboardPad {
  id: string;
  campaign_id: string;
  user_id: string;
  page_id: string;
  /** 0 to 7. */
  lane: number;
  /** 0 and up; a controller shows rows 0 to 7. */
  grid_row: number;
  /** A scene (ambient) or music playlist; null for a pad that plays its takes. */
  playlist_id: string | null;
  /** Overrides the sound's or playlist's own name on the pad. */
  name: string | null;
  launch_mode: LaunchMode | null;
  loop: boolean | null;
  /** 0 to 1. */
  volume: number;
  fade_in_ms: number | null;
  fade_out_ms: number | null;
  /** Nudge pitch and loudness a little on each press. */
  vary: boolean;
  /** Louder the harder a controller pad is hit. */
  velocity: boolean;
  /** Repeat mode's beat, 100 to 5000 ms. */
  repeat_ms: number;
  created_at: string;
  updated_at: string;
}

/** A `soundboard_pad_takes` row: one of the sounds a sound pad plays, in order. */
export interface SoundboardPadTake {
  id: string;
  pad_id: string;
  sound_id: string;
  position: number;
  created_at: string;
  updated_at: string;
}

/** A pad as read: its takes embedded, in position order. */
export type SoundboardPadWithTakes = SoundboardPad & { takes: SoundboardPadTake[] };

export type SoundboardPadInsert = Pick<SoundboardPad, "campaign_id" | "page_id" | "lane" | "grid_row"> &
  Partial<Pick<SoundboardPad,
    "playlist_id" | "name" | "launch_mode" | "loop" | "volume" | "fade_in_ms" | "fade_out_ms" | "vary" | "velocity" | "repeat_ms">>;

export type SoundboardPadUpdate = Partial<Pick<SoundboardPad,
  "page_id" | "lane" | "grid_row" | "playlist_id" | "name" | "launch_mode" | "loop" | "volume"
  | "fade_in_ms" | "fade_out_ms" | "vary" | "velocity" | "repeat_ms">>;

export interface Sound {
  id: string;
  user_id: string;
  campaign_id: string;
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
