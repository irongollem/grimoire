/**
 * The deck's snapshot (#1136): the grid of cells every surface draws from.
 * Pure reading, kept apart from useDeck's presses and timers.
 */

import { computed, type ComputedRef, type Ref } from "vue";
import { placeGuests, targetId, type GuestTrigger, type PlacedGuest } from "@/lib/audio/deck/deckGuests";
import {
  effectiveLaunchMode,
  emptyDeckCell,
  isDefaultLaunchMode,
  laneCategory,
  padArt,
  rowsForPage,
  keyRowFor,
  pageLanes,
  rowKey,
} from "@/lib/audio/deck/deckModel";
import {
  DECK_LANES,
  type DeckCellView,
  type DeckLaneView,
  type DeckPadKind,
  type DeckLight,
  type DeckSnapshot,
  type DeckTool,
} from "@/lib/audio/deck/deckSurface";
import { useAudioSharing } from "@/composables/soundboard/useAudioSharing";
import { useActiveAudioTriggers } from "@/composables/soundboard/useAudioThemeTriggers";
import type { DeckReadout } from "@/composables/soundboard/useDeckReadout";
import type { Sound } from "@/types/sound.types";
import type { DeckPadInfo, DeckResolved } from "@/composables/soundboard/useDeckResolved";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";

const SPOTIFY_SHARING_NOTE = "Spotify: this device only";

export interface DeckSnapshotState {
  resolved: DeckResolved;
  readout: DeckReadout;
  cursors: Readonly<Ref<Record<string, number>>>;
  heldPadIds: Readonly<Ref<ReadonlySet<string>>>;
  fadingIds: Readonly<Ref<ReadonlySet<string>>>;
  hushOn: Readonly<Ref<boolean>>;
  currentTool: Readonly<Ref<DeckTool>>;
  lockedTool: Readonly<Ref<DeckTool>>;
  /** The row a screen last said was in view; the snapshot keeps it on the page. */
  rowInView: Readonly<Ref<number>>;
}

export function useDeckSnapshot(state: DeckSnapshotState): ComputedRef<DeckSnapshot> {
  const store = useSoundboardStore();
  const spotify = useSpotifyStore();
  const sharing = useAudioSharing();
  const { pages, activePage, pagePads, byPlaylist, soundsById, playlistsById } = state.resolved;
  const { musicTrigger, ambientTriggers } = useActiveAudioTriggers();
  const { cursors, heldPadIds, fadingIds, hushOn, currentTool, lockedTool, rowInView } = state;
  const { isAudible, padLoops, blockedFor, isSoloed, progressOf, volumeOf, nextSound } = state.readout;

  function lightOf(info: DeckPadInfo, audible: boolean, loop: boolean, blocked: string | null, soloed: boolean): DeckLight {
    if (heldPadIds.value.has(info.pad.id)) return "held";
    if (fadingIds.value.has(info.pad.id)) return "fading";
    if (audible) {
      if (store.soloIds !== null && !soloed) return "ducked";
      return loop ? "looping" : "playing";
    }
    return blocked !== null ? "blocked" : "ready";
  }

  function metaOf(info: DeckPadInfo): string | null {
    const playlist = info.playlist;
    if (info.kind === "sound") {
      const next = nextSound(info);
      return sharing.value && next !== null && next.source_type === "spotify" ? SPOTIFY_SHARING_NOTE : null;
    }
    // A scene's layers and a playlist's tracks are counted on the kind icon (`countOf`).
    if (!playlist || info.kind === "scene") return null;
    const music = store.activeMusicPlaylist;
    return music && music.playlistId === playlist.id ? `${music.currentIndex + 1}/${music.trackSoundIds.length}` : null;
  }

  function artOf(info: DeckPadInfo): string | null {
    if (info.kind === "sound") return padArt(info.sounds, nextSound(info)?.id ?? null);
    if (!info.playlist) return null;
    const tracks = byPlaylist.value?.get(info.playlist.id);
    if (tracks === undefined) return null;
    const music = store.activeMusicPlaylist;
    const playing = music && music.playlistId === info.playlist.id ? music.trackSoundIds[music.currentIndex] : undefined;
    return padArt(tracks.map((t) => t.sound), playing === undefined ? null : playing);
  }

  function countOf(info: DeckPadInfo): number | null {
    if (info.kind === "sound" || !info.playlist) return null;
    return byPlaylist.value?.get(info.playlist.id)?.length ?? null;
  }


  function cellOf(info: DeckPadInfo, keyRow: number): DeckCellView {
    const { pad } = info;
    const audible = isAudible(info);
    const loop = padLoops(info);
    const blocked = blockedFor(info);
    const soloed = isSoloed(info);
    const first = info.sounds[0];
    const count = info.sounds.length;
    const cursor = cursors.value[pad.id];
    return {
      lane: pad.lane,
      row: pad.grid_row,
      padId: pad.id,
      guest: null,
      kind: info.kind,
      category: info.category,
      name: pad.name !== null && pad.name !== "" ? pad.name : first ? first.name : info.playlist ? info.playlist.name : "",
      light: lightOf(info, audible, loop, blocked, soloed),
      loop,
      mode: effectiveLaunchMode(pad, info.category, info.kind),
      modeIsDefault: isDefaultLaunchMode(pad, info.category, info.kind),
      takes: info.kind === "sound" ? pad.takes.length : 0,
      nextTake: count > 0 ? (cursor === undefined ? 0 : cursor) % count : 0,
      progress: progressOf(info),
      volume: volumeOf(pad),
      soloed,
      blockedReason: blocked,
      art: artOf(info),
      count: countOf(info),
      meta: metaOf(info),
      keyLabel: rowKey(pad.lane, pad.grid_row, keyRow),
    };
  }

  // ── Guests: triggered audio no pad on this page holds ──────────────────────

  function soundCategory(soundId: string) {
    return soundsById.value.get(soundId)?.category;
  }

  function targetAudible(target: string): boolean {
    const id = targetId(target);
    if (target !== id) return store.playbackStates[id]?.isPlaying === true;
    return store.activeMusicPlaylist?.playlistId === id || store.activeAmbientPlaylists.some((s) => s.playlistId === id);
  }

  const guests = computed<PlacedGuest[]>(() => {
    const page = activePage.value;
    if (!page) return [];
    const triggers: GuestTrigger[] = [];
    if (musicTrigger.value) triggers.push(musicTrigger.value);
    triggers.push(...ambientTriggers.value);
    const heldIds = new Set<string>();
    for (const info of pagePads.value) {
      if (info.playlist) heldIds.add(info.playlist.id);
      for (const sound of info.sounds) heldIds.add(sound.id);
    }
    return placeGuests({
      lanes: pageLanes(page),
      heldIds,
      occupied: pagePads.value.map((info) => ({ lane: info.pad.lane, row: info.pad.grid_row })),
      triggers: triggers.filter((trigger) => targetAudible(trigger.target)),
      soundCategory,
    });
  });

  /** The sound ids a guest stands for, for Solo's ducking. */
  function guestSoundIds(guest: PlacedGuest, kind: DeckPadKind): string[] {
    const id = targetId(guest.target);
    if (kind === "sound") return [id];
    if (kind === "scene") {
      const scene = store.activeAmbientPlaylists.find((s) => s.playlistId === id);
      return scene ? [...scene.soundIds] : [];
    }
    const music = store.activeMusicPlaylist;
    if (music === null || music.playlistId !== id) return [];
    const current = music.trackSoundIds[music.currentIndex];
    return current === undefined ? [] : [current];
  }

  function guestCell(guest: PlacedGuest, keyRow: number): DeckCellView {
    const id = targetId(guest.target);
    const isSound = guest.target !== id;
    const sound: Sound | undefined = isSound ? soundsById.value.get(id) : undefined;
    const list = isSound ? undefined : playlistsById.value.get(id);
    const ambient = list ? list.playlist_type === "ambient" : ambientTriggers.value.some((t) => t.target === guest.target);
    const kind: DeckPadKind = isSound ? "sound" : ambient ? "scene" : "playlist";
    const category = sound ? sound.category : ambient ? "ambient" : "music";
    const loop = kind === "scene" || (kind === "sound" && store.isLooping(id));
    const ids = guestSoundIds(guest, kind);
    const soloed = store.soloIds !== null && ids.length > 0 && ids.every((sid) => store.soloIds?.includes(sid) === true);
    let light: DeckLight = loop ? "looping" : "playing";
    if (fadingIds.value.has(`guest:${guest.target}`)) light = "fading";
    else if (store.soloIds !== null && !soloed) light = "ducked";
    let name = guest.label;
    if (sound) name = sound.name;
    else if (list) name = list.name;
    return {
      ...emptyDeckCell(guest.lane, guest.row),
      guest: { sourceId: guest.sourceId, label: guest.label, target: guest.target },
      kind,
      category,
      name,
      light,
      loop,
      mode: "toggle",
      modeIsDefault: true,
      volume: 1,
      soloed,
      meta: `From ${guest.label}`,
      keyLabel: rowKey(guest.lane, guest.row, keyRow),
    };
  }

  const snapshot = computed<DeckSnapshot>(() => {
    const page = activePage.value;
    const padsHere = pagePads.value;
    const guestsHere = guests.value;
    const rows = rowsForPage([...padsHere.map((info) => info.pad), ...guestsHere.map((g) => ({ lane: g.lane, grid_row: g.row }))]);
    // First one in a cell wins, as the linear find did.
    const padAt = new Map<string, (typeof padsHere)[number]>();
    for (const info of padsHere) {
      const key = `${info.pad.lane}:${info.pad.grid_row}`;
      if (!padAt.has(key)) padAt.set(key, info);
    }
    const guestAt = new Map<string, (typeof guestsHere)[number]>();
    for (const g of guestsHere) {
      const key = `${g.lane}:${g.row}`;
      if (!guestAt.has(key)) guestAt.set(key, g);
    }
    const keyRow = keyRowFor(rowInView.value, rows);
    const cells: DeckCellView[] = [];
    for (let row = 0; row < rows; row++) {
      for (let lane = 0; lane < DECK_LANES; lane++) {
        const found = padAt.get(`${lane}:${row}`);
        const guest = found ? undefined : guestAt.get(`${lane}:${row}`);
        cells.push(found ? cellOf(found, keyRow) : guest ? guestCell(guest, keyRow) : emptyDeckCell(lane, row));
      }
    }
    const lanes: DeckLaneView[] = pageLanes(page).map((def, lane) => ({
      name: def.name,
      rule: def.rule,
      feed: def.feed === undefined ? null : def.feed,
      category: laneCategory(padsHere.filter((info) => info.pad.lane === lane).map((info) => info.category)),
    }));
    return {
      pages: pages.value.map((p) => ({ id: p.id, name: p.name })),
      pageIndex: page ? pages.value.findIndex((p) => p.id === page.id) : -1,
      lanes,
      rows,
      cells,
      keyRow,
      tool: currentTool.value,
      lockedTool: lockedTool.value,
      hush: hushOn.value,
      paused: store.isPausedAll,
      audibleCount: store.activeAudioCount + (spotify.isPlaying ? 1 : 0),
      masterVolume: store.masterVolume,
    };
  });
  return snapshot;
}
