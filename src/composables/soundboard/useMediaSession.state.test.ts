import { describe, expect, it, vi } from "vitest";
import { nextTick, reactive } from "vue";

// A fake store holding only what the session reads, so the test drives the
// playlist the way the real store moves it: the flag, the clock, the index.
const states = reactive<Record<string, { isPlaying: boolean; currentTime: number; duration: number }>>({});
const store = reactive({
  activeMusicPlaylist: null as null | {
    playlistId: string;
    playlistName: string;
    currentIndex: number;
    trackSoundIds: string[];
    soundNames: Record<string, string>;
    artists: Record<string, string | null>;
    thumbnailUrls: Record<string, string | null>;
    fileUrls: Record<string, string>;
  },
  loosePlaying: [],
  activeAmbientPlaylists: [],
  isPausedAll: false,
  getState: (id: string) => states[id],
  resumeAudioEngine: vi.fn(),
});
vi.mock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));

const session = {
  playbackState: "none" as MediaSessionPlaybackState,
  metadata: null as unknown,
  setActionHandler: vi.fn(),
  setPositionState: vi.fn(),
};
Object.defineProperty(navigator, "mediaSession", { value: session, configurable: true });
vi.stubGlobal("MediaMetadata", class { constructor(public init: unknown) {} });

const { useMediaSession } = await import("@/composables/soundboard/useMediaSession");

// The lock screen showed a play button at 0:00 over a playing playlist (7 Nov 2026):
// iOS flips the state to paused itself when an element ends or pauses, and the
// session only ever sent the state when the store's flag flipped, which it never did.
describe("useMediaSession playback state", () => {
  it("tells the OS it is playing again when a track restarts under a lock screen iOS set to paused", async () => {
    states.a = { isPlaying: true, currentTime: 10, duration: 47 };
    useMediaSession();
    store.activeMusicPlaylist = {
      playlistId: "pl", playlistName: "Tavern", currentIndex: 0, trackSoundIds: ["a"],
      soundNames: { a: "Honey-Glitter" }, artists: { a: null }, thumbnailUrls: { a: null }, fileUrls: { a: "a.mp3" },
    };
    await nextTick();
    expect(session.playbackState).toBe("playing");

    session.playbackState = "paused"; // iOS, when the repeating track's element ended
    states.a.currentTime = 0; // the store restarts it: the flag stays true throughout
    await nextTick();

    expect(session.playbackState).toBe("playing");
  });
});
