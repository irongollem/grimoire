import type { Sound, SoundboardPlaylist, PlaylistType } from "@/types/sound.types";

/**
 * Resolving a theme label to something to play.
 *
 * The alternative — a foreign key from each encounter to one playlist — is
 * exactly the prep burden this avoids: nobody is going to curate a dedicated
 * track per encounter. Instead an encounter asks for "battle" and anything
 * wearing that label is a candidate, so labelling three playlists once gives
 * every future combat variety for free.
 *
 * Matching is case- and whitespace-insensitive because the label is free text
 * typed in two different places months apart.
 */

/** Which channel a theme drives. Encounters ask for music, locations for ambience. */
export type AudioSlot = PlaylistType;

export type ThemeMatch =
  | { kind: "playlist"; playlist: SoundboardPlaylist }
  | { kind: "sound"; sound: Sound };

export function normaliseTheme(value: string): string {
  return value.toLowerCase().trim().replace(/\s+/g, " ");
}

export function tagsIncludeTheme(tags: readonly string[], theme: string): boolean {
  const wanted = normaliseTheme(theme);
  if (wanted === "") return false;
  return tags.some((tag) => normaliseTheme(tag) === wanted);
}

/**
 * Every theme label in use, for the picker's suggestions. Sorted so the list is
 * stable rather than dependent on row order.
 */
export function collectThemes(
  playlists: readonly SoundboardPlaylist[],
  sounds: readonly Sound[],
): string[] {
  const seen = new Map<string, string>();
  const add = (tag: string): void => {
    const key = normaliseTheme(tag);
    // Keep the first spelling encountered, so "Battle" does not become "battle"
    // in the DM's own picker.
    if (key !== "" && !seen.has(key)) seen.set(key, tag.trim());
  };
  playlists.forEach((p) => p.tags.forEach(add));
  sounds.forEach((s) => s.tags.forEach(add));
  return [...seen.values()].sort((a, b) => a.localeCompare(b));
}

/** Candidate playlists for a theme, restricted to the slot's own type. */
export function themePlaylists(
  theme: string,
  slot: AudioSlot,
  playlists: readonly SoundboardPlaylist[],
): SoundboardPlaylist[] {
  return playlists.filter((p) => p.playlist_type === slot && tagsIncludeTheme(p.tags, theme));
}

/** Candidate loose sounds, used only when no playlist answers the theme. */
export function themeSounds(
  theme: string,
  slot: AudioSlot,
  sounds: readonly Sound[],
): Sound[] {
  return sounds.filter((s) => s.category === slot && tagsIncludeTheme(s.tags, theme));
}

/**
 * Pick something to play for a theme, or null when nothing answers it.
 *
 * Null is a real answer and the caller must honour it by doing nothing at all:
 * a trigger that cannot find a match must never stop what the DM already has
 * running. Silence chosen by the DM beats silence chosen by us.
 *
 * Playlists win over loose sounds — a scene is what "battle music" means, and a
 * single file is the fallback for a DM who has not built one yet.
 */
export function resolveAudioTheme(
  theme: string,
  slot: AudioSlot,
  playlists: readonly SoundboardPlaylist[],
  sounds: readonly Sound[],
  pick: (count: number) => number = (count) => Math.floor(Math.random() * count),
): ThemeMatch | null {
  const candidatePlaylists = themePlaylists(theme, slot, playlists);
  if (candidatePlaylists.length > 0) {
    const chosen = candidatePlaylists[clampIndex(pick(candidatePlaylists.length), candidatePlaylists.length)];
    return { kind: "playlist", playlist: chosen };
  }

  const candidateSounds = themeSounds(theme, slot, sounds);
  if (candidateSounds.length > 0) {
    const chosen = candidateSounds[clampIndex(pick(candidateSounds.length), candidateSounds.length)];
    return { kind: "sound", sound: chosen };
  }

  return null;
}

/** A supplied picker returning something out of range must not yield undefined. */
function clampIndex(index: number, length: number): number {
  if (!Number.isFinite(index)) return 0;
  return Math.max(0, Math.min(length - 1, Math.floor(index)));
}
