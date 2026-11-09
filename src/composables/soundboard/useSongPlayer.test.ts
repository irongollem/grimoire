import { describe, expect, it, vi } from "vitest";
import { effectScope } from "vue";
import type { Song } from "@/lib/songs/songShelf";
import { useSongPlayer } from "./useSongPlayer";

/**
 * Just enough of an audio element. play() and pause() flip `paused` at once and fire their events later, as a
 * browser does, and `load` can be held open to stand for a song still downloading.
 */
function fakeAudio() {
  const listeners: Record<string, Array<() => void>> = {};
  let holdLoad: Promise<void> | null = null;
  const el = {
    src: "",
    volume: 1,
    preload: "",
    paused: true,
    ended: false,
    currentTime: 0,
    duration: 0,
    addEventListener: (type: string, fn: () => void) => (listeners[type] ??= []).push(fn),
    fire: (type: string) => listeners[type]?.forEach((fn) => fn()),
    holdNextPlay(): () => void {
      let release!: () => void;
      holdLoad = new Promise<void>((r) => (release = r));
      return release;
    },
    play: vi.fn(async () => {
      el.paused = false;
      const wait = holdLoad;
      holdLoad = null;
      if (wait) await wait;
      if (el.paused) throw new DOMException("cancelled", "AbortError");
      el.fire("playing");
    }),
    pause: vi.fn(() => {
      if (el.paused) return;
      el.paused = true;
      queueMicrotask(() => el.fire("pause"));
    }),
    removeAttribute: vi.fn(),
    load: vi.fn(),
  };
  return el;
}

const song = (id: string): Song => ({
  id, name: id, url: `https://example.invalid/${id}.mp3`, coverUrl: null, artist: null, gainTrim: 1, picture: 0, colour: 0,
});

function setup() {
  const audio = fakeAudio();
  const scope = effectScope();
  const player = scope.run(() => useSongPlayer(() => audio as unknown as HTMLAudioElement))!;
  return { audio, player, scope };
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("useSongPlayer", () => {
  it("pauses the playing song when its button is tapped again, and carries on from there on the next tap", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    expect(player.playing.value).toBe(true);

    await player.tap(song("a"));
    await settle();
    expect(player.playing.value).toBe(false);
    expect(player.currentId.value).toBe("a");

    audio.src = "kept";
    await player.tap(song("a"));
    expect(player.playing.value).toBe(true);
    expect(audio.src).toBe("kept");
  });

  it("a second tap while the song is still loading cancels it rather than asking for it again", async () => {
    const { audio, player } = setup();
    const release = audio.holdNextPlay();
    const first = player.tap(song("a"));
    await player.tap(song("a"));
    release();
    await first;
    await settle();
    expect(audio.play).toHaveBeenCalledTimes(1);
    expect(audio.paused).toBe(true);
    expect(player.playing.value).toBe(false);
    expect(player.failedId.value).toBeNull();
  });

  it("switches to another song from its start, and the old song's pause does not turn the new one off", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    await player.tap(song("b"));
    await settle();
    expect(player.currentId.value).toBe("b");
    expect(audio.src).toBe("https://example.invalid/b.mp3");
    expect(player.playing.value).toBe(true);
  });

  it("a pause from outside the page (headphones, the lock screen) turns the button off", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    audio.paused = true;
    audio.fire("pause");
    expect(player.playing.value).toBe(false);
    expect(player.currentId.value).toBe("a");
  });

  it("lets go of a song when it ends, so the button reads as off", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    audio.paused = true;
    audio.ended = true;
    audio.fire("ended");
    expect(player.currentId.value).toBeNull();
    expect(player.playing.value).toBe(false);
  });

  it("marks a song the browser could not start", async () => {
    const { audio, player } = setup();
    audio.play.mockRejectedValueOnce(new DOMException("unsupported", "NotSupportedError"));
    await player.tap(song("a"));
    expect(player.failedId.value).toBe("a");
    expect(player.currentId.value).toBeNull();
  });

  it("marks a song that breaks after it started", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    audio.fire("error");
    expect(player.failedId.value).toBe("a");
    expect(player.currentId.value).toBeNull();
    expect(player.playing.value).toBe(false);
  });

  it("an older request's late failure does not undo a newer tap on the same song", async () => {
    const { audio, player } = setup();
    let rejectFirst!: (e: unknown) => void;
    audio.play.mockImplementationOnce(() => {
      audio.paused = false;
      return new Promise<void>((_, reject) => (rejectFirst = reject));
    });
    const first = player.tap(song("a"));
    await player.tap(song("a"));
    await player.tap(song("a"));
    rejectFirst(new DOMException("network", "NotSupportedError"));
    await first;
    expect(player.failedId.value).toBeNull();
    expect(player.currentId.value).toBe("a");
    expect(player.playing.value).toBe(true);
  });

  it("marks a paused song the browser refuses to carry on", async () => {
    const { audio, player } = setup();
    await player.tap(song("a"));
    await player.tap(song("a"));
    audio.play.mockRejectedValueOnce(new DOMException("blocked", "NotAllowedError"));
    await player.tap(song("a"));
    expect(player.failedId.value).toBe("a");
    expect(player.playing.value).toBe(false);
  });
});

describe("useSongPlayer and the lock screen", () => {
  function fakeMediaSession() {
    const session = { metadata: null as unknown, playbackState: "none", setActionHandler: vi.fn() };
    vi.stubGlobal("navigator", { mediaSession: session });
    vi.stubGlobal("MediaMetadata", class { constructor(public init: unknown) {} });
    return session;
  }

  it("hands the lock screen back when the page goes, but leaves it to whatever took it since", async () => {
    const session = fakeMediaSession();
    const mine = setup();
    await mine.player.tap(song("a"));
    expect(session.metadata).not.toBeNull();
    mine.scope.stop();
    expect(session.metadata).toBeNull();
    expect(session.playbackState).toBe("none");
    expect(session.setActionHandler).toHaveBeenCalledWith("play", null);
    expect(session.setActionHandler).toHaveBeenCalledWith("pause", null);

    const again = setup();
    await again.player.tap(song("b"));
    const someoneElse = { title: "Soundboard" };
    session.metadata = someoneElse;
    session.playbackState = "playing";
    session.setActionHandler.mockClear();
    again.scope.stop();
    expect(session.metadata).toBe(someoneElse);
    expect(session.playbackState).toBe("playing");
    expect(session.setActionHandler).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("follows a pause from outside on the lock screen", async () => {
    const session = fakeMediaSession();
    const { audio, player } = setup();
    await player.tap(song("a"));
    expect(session.playbackState).toBe("playing");
    audio.paused = true;
    audio.fire("pause");
    expect(session.playbackState).toBe("paused");
    vi.unstubAllGlobals();
  });
});
