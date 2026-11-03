import { reactive, ref } from "vue";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ActiveTrigger } from "@/composables/soundboard/useAudioThemeTriggers";

const store = reactive({
  activeMusicPlaylist: null as null | {
    playlistId: string;
    playlistName: string;
    trackSoundIds: string[];
    soundNames: Record<string, string>;
    currentIndex: number;
  },
  activeAmbientPlaylists: [] as { playlistId: string; playlistName: string; soundIds: string[] }[],
  playbackStates: {} as Record<string, { isPlaying: boolean }>,
  stop: vi.fn(),
  stopAmbientPlaylist: vi.fn(),
  stopMusicPlaylist: vi.fn(),
  musicPlaylistNext: vi.fn(),
  musicPlaylistPrev: vi.fn(),
});
const sounds = ref([{ id: "s1", name: "Rain", category: "ambient" as const }]);
const trigger: ActiveTrigger = { sourceId: "t", label: "Road", kind: "encounter" as ActiveTrigger["kind"], slot: "ambient" as ActiveTrigger["slot"], target: "scene1" };

vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));
vi.mock("@/composables/soundboard/useSounds", () => ({ useSounds: () => ({ data: sounds }) }));
vi.mock("@/composables/soundboard/useAudioThemeTriggers", () => ({
  useActiveAudioTriggers: () => ({
    musicTrigger: ref(null),
    triggerForPlaylist: (id: string) => (id === "scene1" ? trigger : null),
    triggerForSound: () => null,
  }),
}));

import { useNowPlaying } from "./useNowPlaying";

beforeEach(() => {
  store.activeMusicPlaylist = null;
  store.activeAmbientPlaylists = [];
  store.playbackStates = {};
  vi.clearAllMocks();
});

describe("useNowPlaying", () => {
  it("is idle only when no slot and no loose sound is audible", () => {
    const now = useNowPlaying();
    expect(now.isIdle.value).toBe(true);
    store.playbackStates = { s1: { isPlaying: true } };
    expect(now.isIdle.value).toBe(false);
  });

  it("leaves out a sound that a running scene already owns, so it is not listed twice", () => {
    store.activeAmbientPlaylists = [{ playlistId: "scene1", playlistName: "Tavern", soundIds: ["s1"] }];
    store.playbackStates = { s1: { isPlaying: true }, s2: { isPlaying: true }, s3: { isPlaying: false } };
    const now = useNowPlaying();
    expect(now.loose.value.map((l) => l.id)).toEqual(["s2"]);
    // An unknown sound shows as ??? in the effects colour rather than a blank row.
    expect(now.loose.value[0]).toMatchObject({ name: "???", category: "effects" });
  });

  it("stops a scene by its own id, so pulling the rain does not close the tavern", () => {
    store.activeAmbientPlaylists = [
      { playlistId: "scene1", playlistName: "Tavern", soundIds: ["a"] },
      { playlistId: "scene2", playlistName: "Rain", soundIds: ["b", "c"] },
    ];
    const now = useNowPlaying();
    now.scenes.value[1]?.stop();
    expect(store.stopAmbientPlaylist).toHaveBeenCalledWith("scene2");
    expect(now.scenes.value[1]?.layers).toBe(2);
    expect(now.scenes.value[0]?.trigger).toBe(trigger);
  });

  it("names the current track, one-based, and falls back to ??? for a missing name", () => {
    store.activeMusicPlaylist = {
      playlistId: "p",
      playlistName: "Exploration",
      trackSoundIds: ["a", "b", "c"],
      soundNames: { a: "First" },
      currentIndex: 1,
    };
    const now = useNowPlaying();
    expect(now.music.value).toMatchObject({ name: "Exploration", trackName: "???", position: 2, trackCount: 3 });
    now.music.value?.next();
    expect(store.musicPlaylistNext).toHaveBeenCalledTimes(1);
  });
});
