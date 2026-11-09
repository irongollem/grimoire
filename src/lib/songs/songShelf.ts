/**
 * The songs page (/songs): what `get_player_songs` returns, shaped into the
 * shelves the page draws. Pure, so the rules a child relies on (a song keeps
 * its picture, a song in two playlists is one button) are tested without a
 * browser.
 */

/** One row of `get_player_songs`: a track of a playlist shared with players. */
export interface PlayerSongRow {
  campaign_id: string;
  campaign_name: string;
  playlist_id: string;
  playlist_name: string;
  sound_id: string;
  name: string;
  file_url: string;
  thumbnail_url: string | null;
  artist: string | null;
  gain_trim: number;
}

export interface Song {
  id: string;
  name: string;
  url: string;
  coverUrl: string | null;
  artist: string | null;
  /** Loudness normalisation, as on the soundboard; the page caps the result at full volume. */
  gainTrim: number;
  /** Index into `SONG_PICTURES`, for a song with no cover art. */
  picture: number;
  /** Index into `SONG_COLOURS`. */
  colour: number;
}

/** One shared playlist: a page of the songs page, swiped to sideways. */
export interface SongShelf {
  playlistId: string;
  playlistName: string;
  campaignId: string;
  campaignName: string;
  songs: Song[];
}

/**
 * Tile colours: bright, far apart in hue, and each dark enough that a white
 * picture on it reads. Kept as fixed colours rather than theme tokens, because
 * a song's colour is how a child who cannot read finds it again, so it must not
 * change with a theme.
 */
export const SONG_COLOURS = [
  "#d6453d", // red
  "#e07b1f", // orange
  "#3c9a4a", // green
  "#178f8a", // teal
  "#2f74c0", // blue
  "#6a4fc4", // violet
  "#c2408f", // pink
] as const;

/**
 * A stable number from a song's id. A picture follows the song, not its place
 * in the list: a DM adding a song at the top must not repaint every button the
 * child has learned.
 */
export function songHash(id: string): number {
  let h = 2166136261;
  for (let i = 0; i < id.length; i++) {
    h ^= id.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Rows into one shelf per shared playlist, in the order the server sent them
 * (campaign, then the DM's playlist order, then track order). A song is a
 * button on every playlist that holds it, once per playlist.
 */
export function toShelves(rows: readonly PlayerSongRow[], pictureCount: number): SongShelf[] {
  const shelves = new Map<string, SongShelf>();
  const seen = new Set<string>();
  for (const row of rows) {
    const key = `${row.playlist_id}:${row.sound_id}`;
    if (seen.has(key)) continue;
    seen.add(key);
    let shelf = shelves.get(row.playlist_id);
    if (!shelf) {
      shelf = {
        playlistId: row.playlist_id,
        playlistName: row.playlist_name,
        campaignId: row.campaign_id,
        campaignName: row.campaign_name,
        songs: [],
      };
      shelves.set(row.playlist_id, shelf);
    }
    const h = songHash(row.sound_id);
    shelf.songs.push({
      id: row.sound_id,
      name: row.name,
      url: row.file_url,
      coverUrl: row.thumbnail_url,
      artist: row.artist,
      gainTrim: row.gain_trim,
      picture: h % pictureCount,
      colour: Math.floor(h / pictureCount) % SONG_COLOURS.length,
    });
  }
  return [...shelves.values()];
}

/** The element volume for a song: its loudness trim, never above full. */
export function songVolume(gainTrim: number): number {
  if (!Number.isFinite(gainTrim) || gainTrim <= 0) return 1;
  return Math.min(1, gainTrim);
}
