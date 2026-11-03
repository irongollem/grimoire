/**
 * What is on the deck (#1136): the page showing and every pad resolved against the
 * playlists and sounds it points at. Split out of useDeck so the controller is
 * about presses and the rest of this is about reading.
 */

import { computed } from "vue";
import { useDeckPads } from "@/composables/soundboard/useDeckPads";
import { useSoundboardPages } from "@/composables/soundboard/useSoundboardPages";
import { useSounds } from "@/composables/soundboard/useSounds";
import { usePlaylists, usePlaylistsTracks } from "@/composables/soundboard/useSoundboardPlaylists";
import { padCategory, padKind } from "@/lib/audio/deck/deckModel";
import type { DeckPadKind } from "@/lib/audio/deck/deckSurface";
import { useSoundboardUiStore } from "@/stores/ui/soundboard";
import type { Sound, SoundCategory, SoundboardPadWithTakes, SoundboardPlaylist } from "@/types/sound.types";

/** A pad with everything the deck derives from it, resolved once. */
export interface DeckPadInfo {
  pad: SoundboardPadWithTakes;
  kind: DeckPadKind;
  category: SoundCategory;
  /** The playlist a scene or music pad plays; null for a sound pad. */
  playlist: SoundboardPlaylist | null;
  /** A sound pad's takes as sounds, in order; a take whose sound is not loaded is left out. */
  sounds: Sound[];
}

export function useDeckResolved() {
  const ui = useSoundboardUiStore();
  const padsQuery = useDeckPads();
  const pagesQuery = useSoundboardPages();
  const playlistsQuery = usePlaylists();
  const soundsQuery = useSounds();

  const pages = computed(() => (pagesQuery.data.value === undefined ? [] : pagesQuery.data.value));

  const activePage = computed(() => {
    const wanted = ui.soundboardActivePage;
    const found = wanted === null ? undefined : pages.value.find((page) => page.id === wanted);
    return found ?? pages.value[0] ?? null;
  });

  const soundsById = computed(() => {
    const map = new Map<string, Sound>();
    if (soundsQuery.data.value) for (const sound of soundsQuery.data.value) map.set(sound.id, sound);
    return map;
  });

  const playlistsById = computed(() => {
    const map = new Map<string, SoundboardPlaylist>();
    if (playlistsQuery.data.value) for (const playlist of playlistsQuery.data.value) map.set(playlist.id, playlist);
    return map;
  });

  /** Every pad on every page, resolved. A pad whose playlist is gone is left out: it reads as empty. */
  const resolved = computed(() => {
    const map = new Map<string, DeckPadInfo>();
    if (!padsQuery.data.value) return map;
    for (const pad of padsQuery.data.value) {
      const kind = padKind(pad, playlistsById.value);
      if (kind === null) continue;
      const playlist = pad.playlist_id === null ? null : playlistsById.value.get(pad.playlist_id) ?? null;
      const sounds: Sound[] = [];
      for (const take of pad.takes) {
        const sound = soundsById.value.get(take.sound_id);
        if (sound) sounds.push(sound);
      }
      const first = sounds[0];
      map.set(pad.id, { pad, kind, category: padCategory(kind, first ? first.category : null), playlist, sounds });
    }
    return map;
  });

  const pagePads = computed(() => {
    const page = activePage.value;
    if (!page) return [];
    return [...resolved.value.values()].filter((info) => info.pad.page_id === page.id);
  });

  // The tracks of every playlist pad, in one read, for "3 layers" and for a start that waits for nothing.
  const playlistPadIds = computed(() =>
    [...resolved.value.values()].flatMap((info) => (info.playlist ? [info.playlist.id] : [])),
  );
  const { byPlaylist } = usePlaylistsTracks(playlistPadIds);

  return { padsQuery, pages, activePage, resolved, pagePads, byPlaylist, soundsById, playlistsById };
}

export type DeckResolved = ReturnType<typeof useDeckResolved>;