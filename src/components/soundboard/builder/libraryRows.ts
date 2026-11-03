import { isSpotifyCollection } from "@/lib/audio/spotifyAuth";
import type { Sound, SoundCategory, SoundboardPlaylist } from "@/types/sound.types";

export type LibraryList = "sounds" | "scenes" | "playlists";

export type LibraryPlacement = { kind: "sound"; id: string } | { kind: "playlist"; id: string };

export interface LibraryRow {
  key: string;
  placement: LibraryPlacement;
  name: string;
  category: SoundCategory;
  /** "3 layers", "12 tracks", or the category word for a single sound. */
  meta: string;
  /** Set for sounds, so the preview button can play them. */
  sound: Sound | null;
  playlist: SoundboardPlaylist | null;
}

export interface LibraryFilter {
  query: string;
  category: SoundCategory | "all";
}

function matches(filter: LibraryFilter, category: SoundCategory, name: string, tags: readonly string[]): boolean {
  if (filter.category !== "all" && filter.category !== category) return false;
  const q = filter.query.trim().toLowerCase();
  if (q === "") return true;
  return name.toLowerCase().includes(q) || tags.some((tag) => tag.toLowerCase().includes(q));
}

const CATEGORY_WORD: Record<SoundCategory, string> = { ambient: "Ambient", music: "Music", effects: "Effect" };

function soundRow(sound: Sound): LibraryRow {
  return {
    key: `sound:${sound.id}`,
    placement: { kind: "sound", id: sound.id },
    name: sound.name,
    category: sound.category,
    meta: CATEGORY_WORD[sound.category],
    sound,
    playlist: null,
  };
}

function playlistRow(playlist: SoundboardPlaylist, count: number | undefined): LibraryRow {
  const isScene = playlist.playlist_type === "ambient";
  const noun = isScene ? "layer" : "track";
  return {
    key: `playlist:${playlist.id}`,
    placement: { kind: "playlist", id: playlist.id },
    name: playlist.name,
    category: isScene ? "ambient" : "music",
    meta: count === undefined ? "" : `${count} ${noun}${count === 1 ? "" : "s"}`,
    sound: null,
    playlist,
  };
}

/**
 * The rows one tab shows. A Spotify playlist or album is a sound row on the
 * Playlists tab (it runs its own running order); a single Spotify track is an
 * ordinary sound, exactly as the board filters them.
 */
export function libraryRows(
  list: LibraryList,
  sounds: readonly Sound[],
  playlists: readonly SoundboardPlaylist[],
  trackCounts: ReadonlyMap<string, number>,
  filter: LibraryFilter,
): LibraryRow[] {
  if (list === "sounds") {
    return sounds
      .filter((s) => s.source_type !== "spotify" || !isSpotifyCollection(s.file_url))
      .filter((s) => matches(filter, s.category, s.name, s.tags))
      .map(soundRow);
  }
  const type = list === "scenes" ? "ambient" : "music";
  const rows = playlists
    .filter((pl) => pl.playlist_type === type)
    .filter((pl) => matches(filter, type === "ambient" ? "ambient" : "music", pl.name, pl.tags))
    .map((pl) => playlistRow(pl, trackCounts.get(pl.id)));
  if (list === "scenes") return rows;
  const spotify = sounds
    .filter((s) => s.source_type === "spotify" && isSpotifyCollection(s.file_url))
    .filter((s) => matches(filter, "music", s.name, s.tags))
    .map((s) => ({ ...soundRow(s), category: "music" as const, meta: "Spotify" }));
  return [...rows, ...spotify];
}

export const DRAG_SOUND = "application/x-grimoire-sound";
export const DRAG_PLAYLIST = "application/x-grimoire-playlist";

export function dragTypeFor(placement: LibraryPlacement): string {
  return placement.kind === "sound" ? DRAG_SOUND : DRAG_PLAYLIST;
}
