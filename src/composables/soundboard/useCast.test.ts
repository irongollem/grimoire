import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createPinia, setActivePinia } from "pinia";
import { nextTick, reactive } from "vue";

// Loading the Cast SDK sends the visitor's IP to Google, so it must wait for
// someone to ask to cast. These pin that, and the preload for a browser that
// already has.
const injected: string[] = [];

async function freshUseCast() {
  vi.resetModules();
  setActivePinia(createPinia());
  return (await import("./useCast")).useCast();
}

describe("useCast", () => {
  beforeEach(() => {
    // Record rather than query: the test DOM fails the load at once, and the
    // onerror handler removes the tag again.
    injected.length = 0;
    const append = document.head.appendChild.bind(document.head);
    vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T): T => {
      if (node instanceof HTMLScriptElement) {
        injected.push(node.src);
        return node;
      }
      return append(node);
    });
    localStorage.clear();
    (window as unknown as { chrome?: object }).chrome = {};
  });

  afterEach(() => vi.restoreAllMocks());

  it("does not contact Google when the soundboard opens", async () => {
    const cast = await freshUseCast();
    expect(injected).toEqual([]);
    expect(cast.isCastAvailable.value).toBe(true);
  });

  it("loads the SDK on the first click, without remembering an unfinished attempt", async () => {
    const cast = await freshUseCast();
    void cast.openDevicePicker();
    expect(injected).toEqual([expect.stringContaining("gstatic.com/cv/js/sender")]);
    expect(cast.isCastLoading.value).toBe(true);
    // Only a started session is remembered; a click alone must not make later
    // visits contact Google automatically.
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
  });

  it("preloads for a browser that has cast before", async () => {
    localStorage.setItem("grimoire:cast-used", "1");
    await freshUseCast();
    expect(injected).toEqual([expect.stringContaining("gstatic.com/cv/js/sender")]);
  });

  it("hides the button, and loads nothing, where Cast cannot work", async () => {
    delete (window as unknown as { chrome?: object }).chrome;
    localStorage.setItem("grimoire:cast-used", "1");
    const cast = await freshUseCast();
    expect(cast.isCastAvailable.value).toBe(false);
    expect(injected).toEqual([]);
  });

  it("offers a retry when the picker fails right after a first-time load", async () => {
    const requestSession = vi.fn().mockRejectedValue("session_error");
    const listener = { addEventListener: vi.fn() };
    const w = window as unknown as Record<string, unknown>;
    w.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({ setOptions: vi.fn(), requestSession, ...listener }),
        },
        RemotePlayer: class {},
        RemotePlayerController: class { addEventListener = vi.fn(); },
        CastContextEventType: { SESSION_STATE_CHANGED: "s" },
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: "p" },
      },
    };
    const cast = await freshUseCast();
    const opened = cast.openDevicePicker();
    (w.__onGCastApiAvailable as (ok: boolean) => void)(true);
    await opened;
    await vi.waitFor(() => expect(cast.needsSecondClick.value).toBe(true));
    expect(requestSession).toHaveBeenCalledOnce();
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
    delete w.cast;
  });

  it("remembers the choice once a session has actually started", async () => {
    let onSession: ((e: { sessionState: string }) => void) | undefined;
    const w = window as unknown as Record<string, unknown>;
    w.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({
            setOptions: vi.fn(),
            requestSession: vi.fn().mockResolvedValue(null),
            addEventListener: (_: string, h: typeof onSession) => { onSession = h; },
          }),
        },
        RemotePlayer: class {},
        RemotePlayerController: class { addEventListener = vi.fn(); },
        CastContextEventType: { SESSION_STATE_CHANGED: "s" },
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: "p" },
        SessionState: {
          SESSION_STARTED: "started",
          SESSION_RESUMED: "resumed",
          SESSION_ENDED: "ended",
          SESSION_START_FAILED: "failed",
        },
      },
    };
    const cast = await freshUseCast();
    const opened = cast.openDevicePicker();
    (w.__onGCastApiAvailable as (ok: boolean) => void)(true);
    await opened;
    expect(localStorage.getItem("grimoire:cast-used")).toBeNull();
    onSession?.({ sessionState: "started" });
    expect(localStorage.getItem("grimoire:cast-used")).toBe("1");
    delete w.cast;
  });
});

// ── The cast session and the store ────────────────────────────────────────────
// A Cast SDK stand-in: it keeps the handlers the composable registers so a test
// can play the part of Google's SDK, and records what is sent to the speaker.
describe("useCast session handling", () => {
  interface MusicPlaylist {
    playlistId: string;
    playlistName: string;
    currentIndex: number;
    paused: boolean;
    trackSoundIds: string[];
    fileUrls: Record<string, string>;
    soundNames: Record<string, string>;
    artists: Record<string, string>;
    thumbnailUrls: Record<string, string>;
    gainTrims: Record<string, number>;
  }
  type CastStore = {
    isCasting: boolean;
    activeMusicPlaylist: MusicPlaylist | null;
    pauseForCast: ReturnType<typeof vi.fn>;
    play: ReturnType<typeof vi.fn>;
    musicPlaylistNext: ReturnType<typeof vi.fn>;
  };
  // A fresh store per test: each test re-imports the module, and an earlier import's watchers must not see this one's changes.
  let store: CastStore;

  const loaded: Array<{ url: string; mime: string; title: string; artist: string; album: string; images: string[] }> = [];
  const remote = { isPaused: false };
  const playOrPause = vi.fn();
  const stop = vi.fn();
  const endCurrentSession = vi.fn();
  let sessionHandler: ((e: { sessionState: string; session?: unknown }) => void) | undefined;
  let playerHandler: ((e: { value: string }) => void) | undefined;
  let idleReason: string | null = null;
  const w = window as unknown as Record<string, unknown>;

  const playlist = (over: Partial<MusicPlaylist> = {}): MusicPlaylist => ({
    playlistId: "pl-1",
    playlistName: "Tavern",
    currentIndex: 0,
    paused: false,
    trackSoundIds: ["s1", "s2"],
    fileUrls: { s1: "https://cdn.example/a/one.ogg", s2: "https://cdn.example/a/two.mp3" },
    soundNames: { s1: "One" },
    artists: {},
    thumbnailUrls: { s1: "https://cdn.example/one.png" },
    gainTrims: { s1: 0.8 },
    ...over,
  });

  const castSession = {
    getSessionObj: () => ({ receiver: { friendlyName: "Kitchen speaker" } }),
    getMediaSession: () => ({ idleReason }),
    loadMedia: (request: { media: { url: string; mime: string; metadata: { title: string; artistName: string; albumName: string; images: Array<{ url: string }> } } }) => {
      const m = request.media;
      loaded.push({ url: m.url, mime: m.mime, title: m.metadata.title, artist: m.metadata.artistName, album: m.metadata.albumName, images: (m.metadata.images ?? []).map((i) => i.url) });
      return Promise.resolve(null);
    },
  };

  async function connect() {
    vi.resetModules();
    vi.doMock("@/stores/soundboard", () => ({ useSoundboardStore: () => store }));
    const { useCast } = await import("./useCast");
    const cast = useCast();
    const opened = cast.openDevicePicker();
    (w.__onGCastApiAvailable as (ok: boolean) => void)(true);
    await opened;
    return cast;
  }

  beforeEach(() => {
    localStorage.clear();
    loaded.length = 0;
    idleReason = null;
    remote.isPaused = false;
    playOrPause.mockReset();
    stop.mockReset();
    endCurrentSession.mockReset();
    store = reactive<CastStore>({ isCasting: false, activeMusicPlaylist: null, pauseForCast: vi.fn(), play: vi.fn(), musicPlaylistNext: vi.fn() });
    vi.spyOn(document.head, "appendChild").mockImplementation(<T extends Node>(node: T): T => node);
    w.chrome = {
      cast: {
        media: {
          MediaInfo: class { metadata: unknown = null; streamType = ""; constructor(public url: string, public mime: string) {} },
          MusicTrackMediaMetadata: class { title = ""; artistName = ""; albumName = ""; images: Array<{ url: string }> = []; },
          LoadRequest: class { autoplay = false; currentTime = -1; constructor(public media: unknown) {} },
          StreamType: { BUFFERED: "BUFFERED" },
          DEFAULT_MEDIA_RECEIVER_APP_ID: "APP",
        },
        Image: class { constructor(public url: string) {} },
        AutoJoinPolicy: { ORIGIN_SCOPED: "origin_scoped" },
      },
    };
    w.cast = {
      framework: {
        CastContext: {
          getInstance: () => ({
            setOptions: vi.fn(),
            requestSession: vi.fn().mockResolvedValue(null),
            endCurrentSession,
            getCurrentSession: () => castSession,
            addEventListener: (_t: string, h: typeof sessionHandler) => { sessionHandler = h; },
          }),
        },
        RemotePlayer: class { get isPaused() { return remote.isPaused; } },
        RemotePlayerController: class {
          addEventListener(_t: string, h: typeof playerHandler) { playerHandler = h; }
          playOrPause = playOrPause;
          stop = stop;
        },
        CastContextEventType: { SESSION_STATE_CHANGED: "s" },
        RemotePlayerEventType: { PLAYER_STATE_CHANGED: "p" },
        SessionState: { SESSION_STARTED: "started", SESSION_RESUMED: "resumed", SESSION_ENDED: "ended", SESSION_START_FAILED: "failed" },
      },
    };
  });

  afterEach(() => {
    vi.doUnmock("@/stores/soundboard");
    vi.restoreAllMocks();
    delete w.cast;
    delete w.chrome;
  });

  it("hands the playing track to the speaker when a session starts, and silences this device", async () => {
    store.activeMusicPlaylist = playlist();
    const cast = await connect();
    sessionHandler!({ sessionState: "started", session: castSession });
    expect(store.isCasting).toBe(true);
    expect(cast.castDeviceName.value).toBe("Kitchen speaker");
    expect(store.pauseForCast).toHaveBeenCalledWith("s1");
    expect(loaded).toEqual([
      {
        url: "https://cdn.example/a/one.ogg",
        mime: "audio/ogg",
        title: "One",
        artist: "Dungeon Grimoire",
        album: "Tavern",
        images: ["https://cdn.example/one.png"],
      },
    ]);
  });

  it("tells an mp3 from an ogg by the file extension, and falls back to a track title when the sound has no name", async () => {
    store.activeMusicPlaylist = playlist({ currentIndex: 1 });
    await connect();
    sessionHandler!({ sessionState: "resumed" });
    expect(loaded[0]).toMatchObject({ mime: "audio/mpeg", title: "Unknown Track", images: [] });
  });

  it("casts the next track when the playlist moves on, but only while casting", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    store.activeMusicPlaylist!.currentIndex = 1;
    await nextTick();
    expect(loaded).toEqual([]); // not casting yet

    sessionHandler!({ sessionState: "started" });
    loaded.length = 0;
    store.activeMusicPlaylist!.currentIndex = 0;
    await nextTick();
    expect(loaded.map((l) => l.url)).toEqual(["https://cdn.example/a/one.ogg"]);
  });

  it("brings the music back to this device when the session ends, unless the playlist was paused", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    sessionHandler!({ sessionState: "started" });
    sessionHandler!({ sessionState: "ended" });
    expect(store.isCasting).toBe(false);
    expect(store.play).toHaveBeenCalledWith("s1", "https://cdn.example/a/one.ogg", "music", 0.8);

    store.play.mockReset();
    sessionHandler!({ sessionState: "started" });
    store.activeMusicPlaylist!.paused = true;
    sessionHandler!({ sessionState: "failed" });
    expect(store.play).not.toHaveBeenCalled();
  });

  it("does not start local playback for a session that never connected", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    sessionHandler!({ sessionState: "failed" });
    expect(store.play).not.toHaveBeenCalled();
  });

  it("moves to the next track only when the speaker went idle because the track finished", async () => {
    await connect();
    sessionHandler!({ sessionState: "started" });

    idleReason = "CANCELLED";
    playerHandler!({ value: "IDLE" });
    idleReason = "FINISHED";
    playerHandler!({ value: "PLAYING" });
    expect(store.musicPlaylistNext).not.toHaveBeenCalled();

    playerHandler!({ value: "IDLE" });
    expect(store.musicPlaylistNext).toHaveBeenCalledTimes(1);

    store.isCasting = false;
    playerHandler!({ value: "IDLE" });
    expect(store.musicPlaylistNext).toHaveBeenCalledTimes(1);
  });

  it("stops the speaker's media when the playlist stops, and mirrors pause and resume", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    sessionHandler!({ sessionState: "started" });

    store.activeMusicPlaylist!.paused = true;
    await nextTick();
    expect(playOrPause).toHaveBeenCalledTimes(1);

    remote.isPaused = true;
    store.activeMusicPlaylist!.paused = false;
    await nextTick();
    expect(playOrPause).toHaveBeenCalledTimes(2);

    store.activeMusicPlaylist = null;
    await nextTick();
    expect(stop).toHaveBeenCalledTimes(1);
  });

  it("does not toggle the speaker when it already is in the state the store asks for", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    sessionHandler!({ sessionState: "started" });

    remote.isPaused = true; // the speaker is already paused
    store.activeMusicPlaylist!.paused = true;
    await nextTick();
    expect(playOrPause).not.toHaveBeenCalled();

    remote.isPaused = false; // and already playing
    store.activeMusicPlaylist!.paused = false;
    await nextTick();
    expect(playOrPause).not.toHaveBeenCalled();
  });

  it("leaves the speaker alone when the playlist stops while nothing is cast", async () => {
    store.activeMusicPlaylist = playlist();
    await connect();
    store.activeMusicPlaylist = null;
    await nextTick();
    expect(stop).not.toHaveBeenCalled();
  });

  it("ends the session instead of opening the picker when already casting", async () => {
    const cast = await connect();
    store.isCasting = true;
    await cast.openDevicePicker();
    expect(endCurrentSession).toHaveBeenCalledWith(true);
  });
});
