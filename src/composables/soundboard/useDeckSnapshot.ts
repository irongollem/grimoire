/**
 * The deck's snapshot (#1136): the grid of cells every surface draws from.
 * Pure reading, kept apart from useDeck's presses and timers.
 */

import { computed, type ComputedRef, type Ref } from "vue";
import {
  DEFAULT_LANES,
  effectiveLaunchMode,
  isDefaultLaunchMode,
  laneCategory,
  rowsForPage,
  topRowKey,
} from "@/lib/audio/deck/deckModel";
import {
  DECK_LANES,
  type DeckCellView,
  type DeckLaneView,
  type DeckLight,
  type DeckSnapshot,
  type DeckTool,
} from "@/lib/audio/deck/deckSurface";
import { useAudioSharing } from "@/composables/soundboard/useAudioSharing";
import type { DeckReadout } from "@/composables/soundboard/useDeckReadout";
import type { DeckPadInfo, DeckResolved } from "@/composables/soundboard/useDeckResolved";
import { useSoundboardStore } from "@/stores/soundboard";
import { useSpotifyStore } from "@/stores/spotify";

const SPOTIFY_SHARING_NOTE = "Spotify: this device only";

function plural(count: number, one: string, many: string): string {
  return `${count} ${count === 1 ? one : many}`;
}

export interface DeckSnapshotState {
  resolved: DeckResolved;
  readout: DeckReadout;
  cursors: Readonly<Ref<Record<string, number>>>;
  heldPadIds: Readonly<Ref<ReadonlySet<string>>>;
  fadingIds: Readonly<Ref<ReadonlySet<string>>>;
  hushOn: Readonly<Ref<boolean>>;
  currentTool: Readonly<Ref<DeckTool>>;
  lockedTool: Readonly<Ref<DeckTool>>;
}

export function useDeckSnapshot(state: DeckSnapshotState): ComputedRef<DeckSnapshot> {
  const store = useSoundboardStore();
  const spotify = useSpotifyStore();
  const sharing = useAudioSharing();
  const { pages, activePage, pagePads, byPlaylist } = state.resolved;
  const { cursors, heldPadIds, fadingIds, hushOn, currentTool, lockedTool } = state;
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
    if (!playlist) return null;
    if (info.kind === "scene") {
      const tracks = byPlaylist.value?.get(playlist.id);
      return tracks ? plural(tracks.length, "layer", "layers") : null;
    }
    const music = store.activeMusicPlaylist;
    if (music && music.playlistId === playlist.id) return `${music.currentIndex + 1}/${music.trackSoundIds.length}`;
    const tracks = byPlaylist.value?.get(playlist.id);
    return tracks ? plural(tracks.length, "track", "tracks") : null;
  }

  function emptyCell(lane: number, row: number): DeckCellView {
    return {
      lane,
      row,
      padId: null,
      kind: null,
      category: null,
      name: "",
      light: "off",
      loop: false,
      mode: "trigger",
      modeIsDefault: true,
      takes: 0,
      nextTake: 0,
      progress: 0,
      volume: 0,
      soloed: false,
      blockedReason: null,
      meta: null,
      keyLabel: null,
    };
  }

  function cellOf(info: DeckPadInfo): DeckCellView {
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
      meta: metaOf(info),
      keyLabel: topRowKey(pad.lane, pad.grid_row),
    };
  }

  const snapshot = computed<DeckSnapshot>(() => {
    const page = activePage.value;
    const padsHere = pagePads.value;
    const rows = rowsForPage(padsHere.map((info) => info.pad));
    const cells: DeckCellView[] = [];
    for (let row = 0; row < rows; row++) {
      for (let lane = 0; lane < DECK_LANES; lane++) {
        const found = padsHere.find((info) => info.pad.lane === lane && info.pad.grid_row === row);
        cells.push(found ? cellOf(found) : emptyCell(lane, row));
      }
    }
    const laneDefs = page ? page.lanes : DEFAULT_LANES;
    const lanes: DeckLaneView[] = laneDefs.map((def, lane) => ({
      name: def.name,
      rule: def.rule,
      category: laneCategory(padsHere.filter((info) => info.pad.lane === lane).map((info) => info.category)),
    }));
    return {
      pages: pages.value.map((p) => ({ id: p.id, name: p.name })),
      pageIndex: page ? pages.value.findIndex((p) => p.id === page.id) : -1,
      lanes,
      rows,
      cells,
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
